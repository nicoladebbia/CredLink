# Auto-Fallback Safety Clause

## Standard Auto-Fallback

"Upon breach of Survival SLO, Provider will force remote-only mode for affected routes until passing two consecutive hourly checks."

## Extended Version

"If the Remote Manifest Survival SLO falls below 99.9% in any given hour, Provider shall automatically:
1. Switch affected services to remote-only mode
2. Notify Customer within 15 minutes
3. Monitor service health every hour
4. Restore normal operations after two consecutive passing health checks
5. Provide incident report within 24 hours"
