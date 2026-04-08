# Heradyne — Uptime Monitoring Setup

## Recommended: BetterStack Uptime (free tier)

1. Go to **betterstack.com/uptime** → Create free account
2. Click **New Monitor**
3. Configure:
   - **URL:** `https://heradyne-production.up.railway.app/health`
   - **Check interval:** 1 minute
   - **Monitor type:** HTTP(S)
   - **Expected status:** 200
   - **Alert after:** 2 consecutive failures (avoids noise)
4. Add alert channel: email or Slack webhook
5. Optional: configure escalation policy (email → SMS after 5 min)

## What the /health endpoint returns

```json
{
  "status": "healthy",
  "components": {
    "database": "healthy",
    "redis": "healthy"
  },
  "timestamp": 1712345678,
  "version": "2.0.0"
}
```

| `status` value | Meaning |
|---------------|---------|
| `healthy` | All components up |
| `degraded` | One component down but service still running |

Set your monitor to alert on:
- HTTP status != 200
- Response body contains `"status": "degraded"` (optional — BetterStack supports body matching)

## Alternative: UptimeRobot (also free)

1. **uptimerobot.com** → Create account → Add New Monitor
2. Monitor Type: **HTTP(S)**
3. URL: `https://heradyne-production.up.railway.app/health`
4. Monitoring Interval: **5 minutes** (free tier minimum)
5. Alert Contacts: add your email

## Status page (optional)

BetterStack provides a public status page at `status.yourcompany.com` — useful for communicating incidents to users without logging into Railway.
