# 🔍 Automated Schedule Conflict Detection System

## Overview

The Automated Schedule Conflict Detection System continuously monitors your ResourceOptimizer database for schedule overlaps and conflicts, automatically notifying administrators when issues are detected.

## Features

### ✅ **Automated Background Scanning**
- Runs continuously in the background
- Configurable scan intervals (default: 1 hour)
- No user intervention required

### ✅ **Intelligent Conflict Detection**
- Leverages existing overlap detection algorithms
- Detects exact duplicates and partial overlaps
- Calculates conflict severity levels

### ✅ **Smart Notification System**
- Integrates with existing notification service
- Groups conflicts by severity
- Prevents notification spam with conflict hashing

### ✅ **Comprehensive Conflict Analysis**
- Room-specific conflict detection
- Day-of-week analysis
- Duration and severity assessment

## Conflict Severity Levels

| Severity | Description | Criteria |
|----------|-------------|----------|
| **Critical** | Exact duplicate schedules | Same time slot, same room |
| **High** | Major overlap | >60 minutes overlap |
| **Medium** | Moderate overlap | 30-60 minutes overlap |
| **Low** | Minor overlap | <30 minutes overlap |

## Installation & Setup

### 1. **Backend Setup**

The conflict detection system is already integrated into your existing backend. No additional installation required.

### 2. **Environment Configuration**

Add to your `.env` file:
```bash
# Conflict detection settings
CONFLICT_SCAN_INTERVAL=3600  # Scan every hour (in seconds)
```

### 3. **Database Collections**

The system automatically creates these MongoDB collections:
- `detected_conflicts` - Stores detected conflicts
- `admin_notifications` - Stores notifications (existing)

## Usage

### **Option 1: Through Admin Dashboard (Recommended)**

1. Navigate to the Admin Dashboard
2. Find the "🔍 Automated Conflict Detection" section
3. Click "Start Monitoring" to begin automated scanning
4. Use "Scan Now" for immediate conflict detection
5. Monitor status and view notifications

### **Option 2: Direct Backend Control**

#### Start Monitoring via API:
```bash
curl -X POST http://localhost:5000/api/manage_resources \
  -H "Content-Type: application/json" \
  -d '{"operation": "conflict_monitoring", "action": "start"}'
```

#### Stop Monitoring:
```bash
curl -X POST http://localhost:5000/api/manage_resources \
  -H "Content-Type: application/json" \
  -d '{"operation": "conflict_monitoring", "action": "stop"}'
```

#### Check Status:
```bash
curl -X POST http://localhost:5000/api/manage_resources \
  -H "Content-Type: application/json" \
  -d '{"operation": "conflict_monitoring", "action": "status"}'
```

#### Manual Scan:
```bash
curl -X POST http://localhost:5000/api/manage_resources \
  -H "Content-Type: application/json" \
  -d '{"operation": "conflict_monitoring", "action": "scan_now"}'
```

### **Option 3: Standalone Service**

Run as a standalone background service:
```bash
cd Backend
python3 start_conflict_monitoring.py
```

## API Endpoints

### Conflict Monitoring Control
- **Endpoint:** `POST /api/manage_resources`
- **Operation:** `conflict_monitoring`
- **Actions:** `start`, `stop`, `status`, `scan_now`

### Example Responses

#### Start Monitoring:
```json
{
  "status": "success",
  "message": "Automated conflict monitoring started",
  "monitoring_active": true,
  "scan_interval": 3600
}
```

#### Conflict Detection Result:
```json
{
  "status": "success",
  "message": "Manual conflict scan completed",
  "conflicts_found": 3,
  "conflicts": [
    {
      "room_id": "BB-GL100",
      "day": "Monday",
      "severity": "Critical",
      "conflict_type": "exact_duplicate",
      "schedule1": {
        "course": "Mathematics 101",
        "time": "08:00-09:55"
      },
      "schedule2": {
        "course": "Physics 201", 
        "time": "08:00-09:55"
      }
    }
  ]
}
```

## Notification Examples

### Critical Conflicts:
```
🚨 CRITICAL: 2 Duplicate Schedules Detected

Found 2 critical schedule conflicts:
• Room BB-GL100 (Monday): Mathematics 101 vs Physics 201 at 08:00-09:55
• Room CB-LT1 (Tuesday): Chemistry Lab vs Biology Lab at 14:00-16:00
```

### General Conflicts:
```
⚠️ High Priority: 1 Schedule Conflict

Detected 1 high priority schedule conflict:
• Room BB-GL200 (Wednesday): English 101 overlaps History 201 for 1h 30m
```

## Monitoring & Logs

### Log Files
- `conflict_detector.log` - Detailed conflict detection logs
- Console output for real-time monitoring

### Log Levels
- **INFO**: Normal operations, scan results
- **WARNING**: Minor issues, recoverable errors  
- **ERROR**: Critical errors, system failures

## Troubleshooting

### Common Issues

#### 1. **Monitoring Not Starting**
- Check MongoDB connection
- Verify environment variables
- Check log files for errors

#### 2. **No Conflicts Detected**
- Verify database has schedule data
- Check time format consistency
- Review overlap detection logic

#### 3. **Too Many Notifications**
- Conflicts are deduplicated by hash
- Only new conflicts trigger notifications
- Adjust scan interval if needed

### Debug Mode

Enable detailed logging:
```python
import logging
logging.getLogger('conflict_detector').setLevel(logging.DEBUG)
```

## Performance Considerations

### Database Impact
- Uses efficient MongoDB aggregation pipelines
- Indexes created automatically for performance
- Minimal impact on existing operations

### Memory Usage
- Lightweight background process
- Processes conflicts in batches
- Automatic cleanup of old conflict records

### Scalability
- Handles thousands of schedules efficiently
- Configurable scan intervals
- Can run on separate server if needed

## Security

### Access Control
- Admin-only API endpoints
- Secure notification delivery
- Audit trail in logs

### Data Privacy
- No sensitive data in notifications
- Conflict hashing for deduplication
- Configurable data retention

## Future Enhancements

- [ ] Email notifications for critical conflicts
- [ ] Conflict resolution suggestions
- [ ] Historical conflict analytics
- [ ] Integration with calendar systems
- [ ] Machine learning for conflict prediction

## Support

For issues or questions:
1. Check the log files first
2. Review this documentation
3. Test with manual scan to isolate issues
4. Contact system administrator

---

**Version:** 1.0  
**Last Updated:** 2024-01-XX  
**Compatibility:** ResourceOptimizer v1.0+
