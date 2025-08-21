#!/usr/bin/env python3

import os
import time
import threading
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from typing import Dict, List, Optional, Tuple
import logging
from collections import defaultdict

# Import existing functions from manage_resources
from manage_resources import (
    check_overlap, 
    normalize_time_format, 
    validate_time_format,
    serialize_mongo_doc,
    time_diff_minutes,
    format_duration
)
from notification_service import notification_service, NotificationType

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('conflict_detector.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ConflictSeverity:
    CRITICAL = "Critical"    # Exact duplicate schedules
    HIGH = "High"           # >60 min overlap
    MEDIUM = "Medium"       # 30-60 min overlap  
    LOW = "Low"            # <30 min overlap

class ScheduleConflictDetector:
    def __init__(self):
        self.mongo_uri = os.getenv("MONGO_URI")
        self.client = MongoClient(self.mongo_uri)
        self.db = self.client['EduResourceDB']
        self.timetables = self.db['timetables']
        self.conflicts_collection = self.db['detected_conflicts']
        
        # Create indexes for performance
        self.conflicts_collection.create_index([("room_id", 1), ("day", 1), ("detected_at", -1)])
        self.conflicts_collection.create_index([("conflict_hash", 1)], unique=True)
        
        # Configuration
        self.scan_interval = int(os.getenv("CONFLICT_SCAN_INTERVAL", "3600"))  # 1 hour default
        self.admin_id = "system_admin"  # Default admin for notifications
        self.running = False
        self.scan_thread = None
        
       

    def start_monitoring(self):
        """Start the automated conflict detection monitoring"""
        if self.running:
            logger.warning("Conflict detector is already running")
            return
            
        self.running = True
        self.scan_thread = threading.Thread(target=self._monitoring_loop, daemon=True)
        self.scan_thread.start()
        logger.info(f"🚀 Started automated conflict monitoring (scan interval: {self.scan_interval}s)")

    def stop_monitoring(self):
        """Stop the automated conflict detection monitoring"""
        self.running = False
        if self.scan_thread:
            self.scan_thread.join(timeout=5)
        logger.info("🛑 Stopped automated conflict monitoring")

    def _monitoring_loop(self):
        """Main monitoring loop that runs in background thread"""
        while self.running:
            try:
                logger.info("🔄 Starting scheduled conflict scan...")
                conflicts_found = self.scan_all_conflicts()
                
                if conflicts_found:
                    logger.info(f"⚠️  Found {len(conflicts_found)} conflicts during scan")
                    self._process_detected_conflicts(conflicts_found)
                else:
                    logger.info("✅ No conflicts detected during scan")
                    
            except Exception as e:
                logger.error(f"❌ Error during conflict scan: {str(e)}")
                
            # Wait for next scan
            time.sleep(self.scan_interval)

    def scan_all_conflicts(self) -> List[Dict]:
        """
        Scan entire database for schedule conflicts
        Returns list of detected conflicts
        """
        logger.info("🔍 Scanning all schedules for conflicts...")
        
        all_conflicts = []
        
        # Get all unique room-day combinations
        pipeline = [
            {"$group": {
                "_id": {
                    "room_id": "$Room ID",
                    "day": "$Day"
                },
                "count": {"$sum": 1}
            }},
            {"$match": {"count": {"$gt": 1}}}  # Only rooms with multiple schedules
        ]
        
        room_day_combinations = list(self.timetables.aggregate(pipeline))
        logger.info(f"📊 Found {len(room_day_combinations)} room-day combinations with multiple schedules")
        
        for combo in room_day_combinations:
            room_id = combo["_id"]["room_id"]
            day = combo["_id"]["day"]
            
            if not room_id or not day:
                continue
                
            # Analyze conflicts for this room-day combination
            conflicts = self._analyze_room_day_conflicts(room_id, day)
            all_conflicts.extend(conflicts)
            
        logger.info(f"🎯 Total conflicts detected: {len(all_conflicts)}")
        return all_conflicts

    def _analyze_room_day_conflicts(self, room_id: str, day: str) -> List[Dict]:
        """Analyze conflicts for a specific room on a specific day"""
        
        # Get all schedules for this room-day
        query = {'Room ID': room_id, 'Day': day}
        schedules = list(self.timetables.find(query, {'_id': 0}))
        
        if len(schedules) < 2:
            return []
            
        # Normalize schedule times
        normalized_schedules = []
        for i, schedule in enumerate(schedules):
            start_time = normalize_time_format(schedule.get('Start'))
            end_time = normalize_time_format(schedule.get('End'))
            
            if validate_time_format(start_time) and validate_time_format(end_time):
                normalized_schedules.append({
                    'index': i,
                    'start': start_time,
                    'end': end_time,
                    'course': schedule.get('Course', 'Unknown'),
                    'department': schedule.get('Department', 'Unknown'),
                    'lecturer': schedule.get('Lecturer', 'Unknown'),
                    'original': schedule
                })
        
        # Check all pairs for conflicts
        conflicts = []
        for i in range(len(normalized_schedules)):
            for j in range(i + 1, len(normalized_schedules)):
                schedule1 = normalized_schedules[i]
                schedule2 = normalized_schedules[j]
                
                if check_overlap(schedule1['start'], schedule1['end'], 
                               schedule2['start'], schedule2['end']):
                    
                    conflict = self._create_conflict_record(
                        room_id, day, schedule1, schedule2
                    )
                    conflicts.append(conflict)
                    
        return conflicts

    def _create_conflict_record(self, room_id: str, day: str, 
                              schedule1: Dict, schedule2: Dict) -> Dict:
        """Create a detailed conflict record"""
        
        # Calculate overlap details
        overlap_start = max(schedule1['start'], schedule2['start'], 
                          key=lambda t: datetime.strptime(t, '%H:%M').time())
        overlap_end = min(schedule1['end'], schedule2['end'], 
                        key=lambda t: datetime.strptime(t, '%H:%M').time())
        overlap_duration = time_diff_minutes(overlap_start, overlap_end)
        
        # Determine severity
        is_exact_duplicate = (schedule1['start'] == schedule2['start'] and 
                            schedule1['end'] == schedule2['end'])
        
        if is_exact_duplicate:
            severity = ConflictSeverity.CRITICAL
        elif overlap_duration >= 60:
            severity = ConflictSeverity.HIGH
        elif overlap_duration >= 30:
            severity = ConflictSeverity.MEDIUM
        else:
            severity = ConflictSeverity.LOW
            
        # Create unique hash for this conflict
        conflict_hash = self._generate_conflict_hash(room_id, day, schedule1, schedule2)
        
        return {
            'conflict_hash': conflict_hash,
            'room_id': room_id,
            'day': day,
            'severity': severity,
            'conflict_type': 'exact_duplicate' if is_exact_duplicate else 'partial_overlap',
            'overlap_start': overlap_start,
            'overlap_end': overlap_end,
            'overlap_duration_minutes': overlap_duration,
            'overlap_duration_formatted': format_duration(overlap_duration),
            'schedule1': {
                'course': schedule1['course'],
                'time': f"{schedule1['start']}-{schedule1['end']}",
                'department': schedule1['department'],
                'lecturer': schedule1['lecturer']
            },
            'schedule2': {
                'course': schedule2['course'],
                'time': f"{schedule2['start']}-{schedule2['end']}",
                'department': schedule2['department'],
                'lecturer': schedule2['lecturer']
            },
            'detected_at': datetime.utcnow(),
            'notified': False
        }

    def _generate_conflict_hash(self, room_id: str, day: str, 
                              schedule1: Dict, schedule2: Dict) -> str:
        """Generate unique hash for conflict to avoid duplicate notifications"""
        # Sort schedules to ensure consistent hash regardless of order
        courses = sorted([schedule1['course'], schedule2['course']])
        times = sorted([f"{schedule1['start']}-{schedule1['end']}", 
                       f"{schedule2['start']}-{schedule2['end']}"])
        
        hash_string = f"{room_id}_{day}_{courses[0]}_{courses[1]}_{times[0]}_{times[1]}"
        return hash_string.replace(' ', '_').replace(':', '')

    def _process_detected_conflicts(self, conflicts: List[Dict], admin_id: str = None):
        """Process detected conflicts and send notifications"""
        new_conflicts = []
        
        for conflict in conflicts:
            # Check if we've already notified about this conflict
            existing = self.conflicts_collection.find_one({
                'conflict_hash': conflict['conflict_hash']
            })
            
            if not existing:
                # New conflict - store and notify
                self.conflicts_collection.insert_one(conflict)
                new_conflicts.append(conflict)
                logger.info(f"🆕 New conflict detected: {conflict['conflict_hash']}")
            else:
                # Update detection timestamp
                self.conflicts_collection.update_one(
                    {'conflict_hash': conflict['conflict_hash']},
                    {'$set': {'last_detected_at': datetime.utcnow()}}
                )
        
        # Send notifications for new conflicts
        if new_conflicts:
            self._send_conflict_notifications(new_conflicts, admin_id)

    def _send_conflict_notifications(self, conflicts: List[Dict], admin_id: str = None):
        """Send notifications for detected conflicts"""

        # Use provided admin_id or fall back to default
        target_admin_id = admin_id or self.admin_id

        # Group conflicts by severity for better notification management
        conflicts_by_severity = defaultdict(list)
        for conflict in conflicts:
            conflicts_by_severity[conflict['severity']].append(conflict)

        # Send notifications grouped by severity
        for severity, severity_conflicts in conflicts_by_severity.items():
            if severity == ConflictSeverity.CRITICAL:
                self._send_critical_conflict_notification(severity_conflicts, target_admin_id)
            else:
                self._send_general_conflict_notification(severity, severity_conflicts, target_admin_id)

    def _send_critical_conflict_notification(self, conflicts: List[Dict], admin_id: str = None):
        """Send high-priority notification for critical conflicts with detailed information"""
        conflict_count = len(conflicts)
        target_admin_id = admin_id or self.admin_id

        title = f"🚨 CRITICAL: {conflict_count} Duplicate Schedule{'s' if conflict_count > 1 else ''} Detected"

        # Create detailed message with all requested information
        message_parts = [
            f"🔍 AUTOMATED SCAN RESULTS:",
            f"Found {conflict_count} critical schedule conflict{'s' if conflict_count > 1 else ''} requiring immediate attention.",
            "",
            "📋 CONFLICT DETAILS:"
        ]

        for i, conflict in enumerate(conflicts[:5], 1):  # Limit to first 5 for readability
            message_parts.extend([
                f"",
                f"🚨 CONFLICT #{i}:",
                f"   📍 Room ID: {conflict['room_id']}",
                f"   📅 Day: {conflict['day']}",
                f"   ⏰ Conflicting Time: {conflict['overlap_start']}-{conflict['overlap_end']}",
                f"   ⚡ Severity: {conflict['severity']} ({conflict['conflict_type']})",
                f"   📚 Course 1: {conflict['schedule1']['course']} ({conflict['schedule1']['department']})",
                f"   👨‍🏫 Lecturer 1: {conflict['schedule1']['lecturer']}",
                f"   📚 Course 2: {conflict['schedule2']['course']} ({conflict['schedule2']['department']})",
                f"   👨‍🏫 Lecturer 2: {conflict['schedule2']['lecturer']}",
                f"   ⏱️ Overlap Duration: {conflict['overlap_duration_formatted']}",
                f"   🎯 Action Required: Immediate resolution needed"
            ])

        if conflict_count > 5:
            message_parts.extend([
                "",
                f"⚠️ ... and {conflict_count - 5} more critical conflicts detected.",
                f"📊 Total conflicts requiring attention: {conflict_count}"
            ])

        message_parts.extend([
            "",
            "🔧 RECOMMENDED ACTIONS:",
            "1. Review conflicting schedules immediately",
            "2. Contact department coordinators",
            "3. Reschedule one of the conflicting courses",
            "4. Verify room assignments are correct",
            "",
            f"🕐 Detected at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        ])

        message = "\n".join(message_parts)

        # Enhanced data payload with comprehensive conflict information
        detailed_conflicts = []
        for conflict in conflicts:
            detailed_conflicts.append({
                'room_id': conflict['room_id'],
                'day': conflict['day'],
                'severity': conflict['severity'],
                'conflict_type': conflict['conflict_type'],
                'overlap_period': f"{conflict['overlap_start']}-{conflict['overlap_end']}",
                'overlap_duration_minutes': conflict['overlap_duration_minutes'],
                'overlap_duration_formatted': conflict['overlap_duration_formatted'],
                'schedule1': {
                    'course': conflict['schedule1']['course'],
                    'department': conflict['schedule1']['department'],
                    'lecturer': conflict['schedule1']['lecturer'],
                    'time_slot': conflict['schedule1']['time']
                },
                'schedule2': {
                    'course': conflict['schedule2']['course'],
                    'department': conflict['schedule2']['department'],
                    'lecturer': conflict['schedule2']['lecturer'],
                    'time_slot': conflict['schedule2']['time']
                },
                'detected_at': conflict['detected_at'].isoformat(),
                'conflict_hash': conflict['conflict_hash'],
                'actionable_data': {
                    'departments_affected': [conflict['schedule1']['department'], conflict['schedule2']['department']],
                    'lecturers_affected': [conflict['schedule1']['lecturer'], conflict['schedule2']['lecturer']],
                    'courses_affected': [conflict['schedule1']['course'], conflict['schedule2']['course']],
                    'resolution_priority': 'IMMEDIATE' if conflict['severity'] == ConflictSeverity.CRITICAL else 'HIGH'
                }
            })

        # Create notification with enhanced data structure
        notification_data = {
            'notification_type': 'critical_conflicts',
            'severity': ConflictSeverity.CRITICAL,
            'conflict_count': conflict_count,
            'conflicts': detailed_conflicts,
            'action_required': True,
            'scan_timestamp': datetime.now().isoformat(),
            'summary': {
                'total_conflicts': conflict_count,
                'rooms_affected': list(set([c['room_id'] for c in conflicts])),
                'days_affected': list(set([c['day'] for c in conflicts])),
                'departments_affected': list(set([c['schedule1']['department'] for c in conflicts] + [c['schedule2']['department'] for c in conflicts])),
                'severity_breakdown': {
                    'critical': len([c for c in conflicts if c['severity'] == ConflictSeverity.CRITICAL]),
                    'high': len([c for c in conflicts if c['severity'] == ConflictSeverity.HIGH]),
                    'medium': len([c for c in conflicts if c['severity'] == ConflictSeverity.MEDIUM]),
                    'low': len([c for c in conflicts if c['severity'] == ConflictSeverity.LOW])
                }
            },
            # Enhanced display data for frontend
            'display_data': {
                'room_ids': [c['room_id'] for c in conflicts],
                'days_of_week': [c['day'] for c in conflicts],
                'conflicting_time_slots': [f"{c['overlap_start']}-{c['overlap_end']}" for c in conflicts],
                'course_names': [f"{c['schedule1']['course']} vs {c['schedule2']['course']}" for c in conflicts],
                'lecturer_info': [f"{c['schedule1']['lecturer']} / {c['schedule2']['lecturer']}" for c in conflicts],
                'department_info': [f"{c['schedule1']['department']} / {c['schedule2']['department']}" for c in conflicts],
                'severity_levels': [c['severity'] for c in conflicts],
                'overlap_durations': [c['overlap_duration_formatted'] for c in conflicts],
                'overlap_minutes': [c['overlap_duration_minutes'] for c in conflicts],
                'actionable_data': [c.get('actionable_data', {}) for c in conflicts]
            }
        }

        notification_service.create_notification(
            admin_id=target_admin_id,
            type='schedule_conflict',  # Use specific type for proper styling
            title=title,
            message=message,
            data=notification_data
        )

        logger.info(f"📧 Sent detailed critical conflict notification for {conflict_count} conflicts")

    def _create_manual_scan_notifications(self, conflicts: List[Dict], admin_id: str):
        """
        Create enhanced notifications for manual scans, regardless of whether conflicts are new.
        This ensures administrators always get detailed conflict information when they request it.
        """
        if not conflicts or not admin_id:
            return

        logger.info(f"📧 Creating manual scan notifications for {len(conflicts)} conflicts for admin {admin_id}")

        # Group conflicts by severity for organized notifications
        severity_groups = {
            ConflictSeverity.CRITICAL: [],
            ConflictSeverity.HIGH: [],
            ConflictSeverity.MEDIUM: [],
            ConflictSeverity.LOW: []
        }

        for conflict in conflicts:
            severity = conflict.get('severity', ConflictSeverity.MEDIUM)
            severity_groups[severity].append(conflict)

        # Create notifications for each severity level that has conflicts
        for severity, severity_conflicts in severity_groups.items():
            if severity_conflicts:
                if severity == ConflictSeverity.CRITICAL:
                    self._send_critical_conflict_notification(severity_conflicts, admin_id)
                elif severity == ConflictSeverity.HIGH:
                    self._send_high_priority_conflict_notification(severity_conflicts, admin_id)
                elif severity == ConflictSeverity.MEDIUM:
                    self._send_medium_priority_conflict_notification(severity_conflicts, admin_id)
                elif severity == ConflictSeverity.LOW:
                    self._send_low_priority_conflict_notification(severity_conflicts, admin_id)

    def _send_high_priority_conflict_notification(self, conflicts: List[Dict], admin_id: str):
        """Send enhanced notification for high priority conflicts"""
        self._send_enhanced_conflict_notification(
            conflicts=conflicts,
            admin_id=admin_id,
            severity=ConflictSeverity.HIGH,
            title_prefix="⚠️ HIGH PRIORITY",
            message_template="High priority schedule conflicts detected"
        )

    def _send_medium_priority_conflict_notification(self, conflicts: List[Dict], admin_id: str):
        """Send enhanced notification for medium priority conflicts"""
        self._send_enhanced_conflict_notification(
            conflicts=conflicts,
            admin_id=admin_id,
            severity=ConflictSeverity.MEDIUM,
            title_prefix="📋 MEDIUM PRIORITY",
            message_template="Medium priority schedule conflicts detected"
        )

    def _send_low_priority_conflict_notification(self, conflicts: List[Dict], admin_id: str):
        """Send enhanced notification for low priority conflicts"""
        self._send_enhanced_conflict_notification(
            conflicts=conflicts,
            admin_id=admin_id,
            severity=ConflictSeverity.LOW,
            title_prefix="📝 LOW PRIORITY",
            message_template="Low priority schedule conflicts detected"
        )

    def _send_enhanced_conflict_notification(self, conflicts: List[Dict], admin_id: str, severity: str, title_prefix: str, message_template: str):
        """Generic method to send enhanced conflict notifications with full display data"""
        conflict_count = len(conflicts)

        # Create title and message
        title = f"{title_prefix}: {conflict_count} Schedule Conflict{'s' if conflict_count != 1 else ''} Detected"
        message = f"{message_template}. {conflict_count} conflict{'s' if conflict_count != 1 else ''} require{'s' if conflict_count == 1 else ''} attention."

        # Create detailed conflicts with enhanced data
        detailed_conflicts = []
        for conflict in conflicts:
            detailed_conflicts.append({
                'room_id': conflict['room_id'],
                'day': conflict['day'],
                'severity': conflict['severity'],
                'conflict_type': conflict['conflict_type'],
                'overlap_period': f"{conflict['overlap_start']}-{conflict['overlap_end']}",
                'overlap_duration_minutes': conflict['overlap_duration_minutes'],
                'overlap_duration_formatted': conflict['overlap_duration_formatted'],
                'schedule1': {
                    'course': conflict['schedule1']['course'],
                    'department': conflict['schedule1']['department'],
                    'lecturer': conflict['schedule1']['lecturer'],
                    'time_slot': conflict['schedule1']['time']
                },
                'schedule2': {
                    'course': conflict['schedule2']['course'],
                    'department': conflict['schedule2']['department'],
                    'lecturer': conflict['schedule2']['lecturer'],
                    'time_slot': conflict['schedule2']['time']
                },
                'detected_at': conflict['detected_at'].isoformat() if hasattr(conflict['detected_at'], 'isoformat') else str(conflict['detected_at']),
                'conflict_hash': conflict['conflict_hash'],
                'actionable_data': {
                    'departments_affected': [conflict['schedule1']['department'], conflict['schedule2']['department']],
                    'lecturers_affected': [conflict['schedule1']['lecturer'], conflict['schedule2']['lecturer']],
                    'courses_affected': [conflict['schedule1']['course'], conflict['schedule2']['course']],
                    'resolution_priority': 'IMMEDIATE' if conflict['severity'] == ConflictSeverity.CRITICAL else 'HIGH' if conflict['severity'] == ConflictSeverity.HIGH else 'MEDIUM'
                }
            })

        # Create notification with enhanced data structure
        notification_data = {
            'notification_type': f'{severity.lower()}_conflicts',
            'severity': severity,
            'conflict_count': conflict_count,
            'conflicts': detailed_conflicts,
            'action_required': True,
            'scan_timestamp': datetime.now().isoformat(),
            'summary': {
                'total_conflicts': conflict_count,
                'rooms_affected': list(set([c['room_id'] for c in conflicts])),
                'days_affected': list(set([c['day'] for c in conflicts])),
                'departments_affected': list(set([c['schedule1']['department'] for c in conflicts] + [c['schedule2']['department'] for c in conflicts])),
                'severity_breakdown': {
                    'critical': len([c for c in conflicts if c['severity'] == ConflictSeverity.CRITICAL]),
                    'high': len([c for c in conflicts if c['severity'] == ConflictSeverity.HIGH]),
                    'medium': len([c for c in conflicts if c['severity'] == ConflictSeverity.MEDIUM]),
                    'low': len([c for c in conflicts if c['severity'] == ConflictSeverity.LOW])
                }
            },
            # Enhanced display data for frontend
            'display_data': {
                'room_ids': [c['room_id'] for c in conflicts],
                'days_of_week': [c['day'] for c in conflicts],
                'conflicting_time_slots': [f"{c['overlap_start']}-{c['overlap_end']}" for c in conflicts],
                'course_names': [f"{c['schedule1']['course']} vs {c['schedule2']['course']}" for c in conflicts],
                'lecturer_info': [f"{c['schedule1']['lecturer']} / {c['schedule2']['lecturer']}" for c in conflicts],
                'department_info': [f"{c['schedule1']['department']} / {c['schedule2']['department']}" for c in conflicts],
                'severity_levels': [c['severity'] for c in conflicts],
                'overlap_durations': [c['overlap_duration_formatted'] for c in conflicts],
                'overlap_minutes': [c['overlap_duration_minutes'] for c in conflicts],
                'actionable_data': [c.get('actionable_data', {}) for c in conflicts]
            }
        }

        notification_service.create_notification(
            admin_id=admin_id,
            type='schedule_conflict',
            title=title,
            message=message,
            data=notification_data
        )

        logger.info(f"📧 Sent enhanced {severity.lower()} conflict notification for {conflict_count} conflicts to admin {admin_id}")

    def _send_general_conflict_notification(self, severity: str, conflicts: List[Dict], admin_id: str = None):
        """Send detailed notification for general conflicts"""
        conflict_count = len(conflicts)
        target_admin_id = admin_id or self.admin_id

        title = f"⚠️ {severity} Priority: {conflict_count} Schedule Conflict{'s' if conflict_count > 1 else ''}"

        # Create detailed message with all requested information
        message_parts = [
            f"🔍 AUTOMATED SCAN RESULTS:",
            f"Detected {conflict_count} {severity.lower()} priority schedule conflict{'s' if conflict_count > 1 else ''}.",
            "",
            "📋 CONFLICT DETAILS:"
        ]

        for i, conflict in enumerate(conflicts[:3], 1):  # Limit to first 3 for readability
            message_parts.extend([
                f"",
                f"⚠️ CONFLICT #{i} ({severity} Priority):",
                f"   📍 Room ID: {conflict['room_id']}",
                f"   📅 Day: {conflict['day']}",
                f"   ⏰ Overlapping Time: {conflict['overlap_start']}-{conflict['overlap_end']}",
                f"   ⚡ Severity: {conflict['severity']} ({conflict['conflict_type']})",
                f"   📚 Course 1: {conflict['schedule1']['course']} ({conflict['schedule1']['department']})",
                f"   👨‍🏫 Lecturer 1: {conflict['schedule1']['lecturer']}",
                f"   🕐 Time Slot 1: {conflict['schedule1']['time']}",
                f"   📚 Course 2: {conflict['schedule2']['course']} ({conflict['schedule2']['department']})",
                f"   👨‍🏫 Lecturer 2: {conflict['schedule2']['lecturer']}",
                f"   🕐 Time Slot 2: {conflict['schedule2']['time']}",
                f"   ⏱️ Overlap Duration: {conflict['overlap_duration_formatted']}",
                f"   🎯 Action Required: {'Yes' if severity in [ConflictSeverity.CRITICAL, ConflictSeverity.HIGH] else 'Monitor'}"
            ])

        if conflict_count > 3:
            message_parts.extend([
                "",
                f"⚠️ ... and {conflict_count - 3} more {severity.lower()} priority conflicts detected.",
                f"📊 Total conflicts in this category: {conflict_count}"
            ])

        # Add severity-specific recommendations
        if severity == ConflictSeverity.HIGH:
            message_parts.extend([
                "",
                "🔧 RECOMMENDED ACTIONS:",
                "1. Review and resolve conflicts within 24 hours",
                "2. Contact affected departments",
                "3. Consider room reassignment or time adjustment",
                "4. Update schedules to prevent future conflicts"
            ])
        elif severity == ConflictSeverity.MEDIUM:
            message_parts.extend([
                "",
                "🔧 RECOMMENDED ACTIONS:",
                "1. Review conflicts within 48 hours",
                "2. Assess impact on students and faculty",
                "3. Plan resolution during next scheduling cycle",
                "4. Monitor for escalation"
            ])
        else:  # LOW severity
            message_parts.extend([
                "",
                "🔧 RECOMMENDED ACTIONS:",
                "1. Monitor conflicts for patterns",
                "2. Consider minor schedule adjustments",
                "3. Review during regular maintenance",
                "4. Document for future planning"
            ])

        message_parts.extend([
            "",
            f"🕐 Detected at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        ])

        message = "\n".join(message_parts)

        # Enhanced data payload with comprehensive conflict information
        detailed_conflicts = []
        for conflict in conflicts:
            detailed_conflicts.append({
                'room_id': conflict['room_id'],
                'day': conflict['day'],
                'severity': conflict['severity'],
                'conflict_type': conflict['conflict_type'],
                'overlap_period': f"{conflict['overlap_start']}-{conflict['overlap_end']}",
                'overlap_duration_minutes': conflict['overlap_duration_minutes'],
                'overlap_duration_formatted': conflict['overlap_duration_formatted'],
                'schedule1': {
                    'course': conflict['schedule1']['course'],
                    'department': conflict['schedule1']['department'],
                    'lecturer': conflict['schedule1']['lecturer'],
                    'time_slot': conflict['schedule1']['time']
                },
                'schedule2': {
                    'course': conflict['schedule2']['course'],
                    'department': conflict['schedule2']['department'],
                    'lecturer': conflict['schedule2']['lecturer'],
                    'time_slot': conflict['schedule2']['time']
                },
                'detected_at': conflict['detected_at'].isoformat(),
                'conflict_hash': conflict['conflict_hash'],
                'actionable_data': {
                    'departments_affected': [conflict['schedule1']['department'], conflict['schedule2']['department']],
                    'lecturers_affected': [conflict['schedule1']['lecturer'], conflict['schedule2']['lecturer']],
                    'courses_affected': [conflict['schedule1']['course'], conflict['schedule2']['course']],
                    'resolution_priority': severity.upper(),
                    'estimated_impact': self._assess_conflict_impact(conflict)
                }
            })

        # Create notification with enhanced data structure
        notification_data = {
            'notification_type': f'{severity.lower()}_priority_conflicts',
            'severity': severity,
            'conflict_count': conflict_count,
            'conflicts': detailed_conflicts,
            'action_required': severity in [ConflictSeverity.CRITICAL, ConflictSeverity.HIGH],
            'scan_timestamp': datetime.now().isoformat(),
            'summary': {
                'total_conflicts': conflict_count,
                'rooms_affected': list(set([c['room_id'] for c in conflicts])),
                'days_affected': list(set([c['day'] for c in conflicts])),
                'departments_affected': list(set([c['schedule1']['department'] for c in conflicts] + [c['schedule2']['department'] for c in conflicts])),
                'average_overlap_minutes': sum([c['overlap_duration_minutes'] for c in conflicts]) / len(conflicts),
                'severity_breakdown': {
                    'critical': len([c for c in conflicts if c['severity'] == ConflictSeverity.CRITICAL]),
                    'high': len([c for c in conflicts if c['severity'] == ConflictSeverity.HIGH]),
                    'medium': len([c for c in conflicts if c['severity'] == ConflictSeverity.MEDIUM]),
                    'low': len([c for c in conflicts if c['severity'] == ConflictSeverity.LOW])
                }
            },
            # Enhanced display data for frontend
            'display_data': {
                'room_ids': [c['room_id'] for c in conflicts],
                'days_of_week': [c['day'] for c in conflicts],
                'conflicting_time_slots': [f"{c['overlap_start']}-{c['overlap_end']}" for c in conflicts],
                'course_names': [f"{c['schedule1']['course']} vs {c['schedule2']['course']}" for c in conflicts],
                'lecturer_info': [f"{c['schedule1']['lecturer']} / {c['schedule2']['lecturer']}" for c in conflicts],
                'department_info': [f"{c['schedule1']['department']} / {c['schedule2']['department']}" for c in conflicts],
                'severity_levels': [c['severity'] for c in conflicts],
                'overlap_durations': [c['overlap_duration_formatted'] for c in conflicts],
                'overlap_minutes': [c['overlap_duration_minutes'] for c in conflicts],
                'actionable_data': [c.get('actionable_data', {}) for c in conflicts]
            }
        }

        notification_service.create_notification(
            admin_id=target_admin_id,
            type='schedule_conflict',  # Use specific type for proper styling
            title=title,
            message=message,
            data=notification_data
        )

        logger.info(f"📧 Sent detailed {severity} conflict notification for {conflict_count} conflicts")

    def _assess_conflict_impact(self, conflict: Dict) -> str:
        """Assess the potential impact of a conflict"""
        overlap_minutes = conflict['overlap_duration_minutes']

        if overlap_minutes >= 90:
            return "HIGH - Significant disruption to both courses"
        elif overlap_minutes >= 60:
            return "MEDIUM - Moderate disruption, affects full class periods"
        elif overlap_minutes >= 30:
            return "LOW-MEDIUM - Partial class disruption"
        else:
            return "LOW - Minor scheduling inconvenience"

# Global conflict detector instance
conflict_detector = ScheduleConflictDetector()

if __name__ == "__main__":
    # For testing - run a single scan
    logger.info("🧪 Running test conflict scan...")
    conflicts = conflict_detector.scan_all_conflicts()
    logger.info(f"✅ Test completed. Found {len(conflicts)} conflicts")
