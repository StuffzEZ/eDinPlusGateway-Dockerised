# eDin+ Gateway Control

A desktop application for monitoring and controlling eDin+ Gateway devices.

## Features

- Real-time monitoring of eDin+ Gateway status
- Event monitoring and reporting
- Connection management (TCP/UDP)
- User authentication
- Event history tracking
- Customizable monitoring intervals
- Event filtering and search capabilities

## Installation

1. Download the latest MSI installer from the releases page
2. Run the installer
3. Follow the installation wizard
4. Launch the application from the Start Menu or Desktop shortcut

## Configuration

### Connection Settings
- **IP Address**: The IP address of your eDin+ Gateway device
- **Connection Type**: TCP or UDP
- **Username**: Gateway authentication username
- **Password**: Gateway authentication password

### Monitoring Settings
- **Polling Interval**: Time between status checks (default: 5 seconds)
- **Event History Size**: Number of events to keep in history (default: 1000)
- **Auto-Connect**: Automatically connect on startup

## API Reference

### Connection Commands

#### Connect
```json
{
    "command": "connect",
    "params": {
        "ip": "192.168.1.100",
        "type": "tcp",
        "username": "admin",
        "password": "password"
    }
}
```

#### Disconnect
```json
{
    "command": "disconnect"
}
```

### Status Commands

#### Get Status
```json
{
    "command": "get_status"
}
```
Response:
```json
{
    "status": "connected",
    "device_info": {
        "model": "eDin+ Gateway",
        "firmware": "1.2.1",
        "uptime": "5d 12h 30m"
    }
}
```

### Event Commands

#### Get Events
```json
{
    "command": "get_events",
    "params": {
        "start_time": "2024-03-20T00:00:00Z",
        "end_time": "2024-03-21T00:00:00Z",
        "event_type": "all"
    }
}
```

#### Clear Events
```json
{
    "command": "clear_events"
}
```

### Event Types

1. **Connection Events**
   - `connected`: Gateway successfully connected
   - `disconnected`: Gateway disconnected
   - `connection_failed`: Failed to connect
   - `reconnecting`: Attempting to reconnect

2. **Status Events**
   - `status_changed`: Gateway status changed
   - `error`: Error occurred
   - `warning`: Warning condition detected

3. **System Events**
   - `startup`: Application started
   - `shutdown`: Application shutting down
   - `settings_updated`: Settings changed

### Event Format
```json
{
    "timestamp": "2024-03-20T15:30:45Z",
    "type": "status_changed",
    "details": {
        "old_status": "disconnected",
        "new_status": "connected",
        "ip": "192.168.1.100"
    }
}
```

## Error Codes

- `E001`: Connection failed
- `E002`: Authentication failed
- `E003`: Invalid command
- `E004`: Timeout
- `E005`: Device not responding
- `E006`: Invalid parameters

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify IP address is correct
   - Check network connectivity
   - Ensure firewall allows connection
   - Verify credentials

2. **No Events Showing**
   - Check event history size setting
   - Verify event types are enabled
   - Check connection status

3. **Application Not Starting**
   - Check system requirements
   - Verify installation
   - Check logs in AppData directory

### Log Files

Logs are stored in: `%APPDATA%\edin_gateway\logs\`

## Support

For technical support or feature requests, please create an issue in the GitHub repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
