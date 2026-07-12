# Cisco Finesse Auto Ready ACW Gadget

A lightweight Cisco Finesse gadget that monitors an agent's After Call Work (ACW) state and automatically sends the agent back to `READY` after a configurable threshold. The default threshold is 3 minutes.

## What it does

- Polls the Cisco Finesse User REST endpoint for the current agent state.
- Detects ACW using a configurable Not Ready reason code and optional label matching.
- Starts a countdown while the agent remains in ACW.
- Rechecks the agent state before sending `READY`.
- Sends a Finesse REST `PUT` request only if the agent is still in ACW.

## Repository layout

```text
src/
  AutoReadyACW.xml   # Gadget XML entry point
  AutoReadyACW.js    # Gadget logic
  AutoReadyACW.css   # Gadget styling
docs/
  deployment-notes.md
  security-review.md
.gitignore
LICENSE
README.md
```

## Configuration

Edit the `CONFIG` block in `src/AutoReadyACW.js` before deployment:

```javascript
ACW_REASON_CODE: "20",
ACW_LIMIT_MS: 180000,
POLL_MS: 5000,
ENFORCE_TEAM: false,
ALLOWED_TEAMS: ["Example_Test_Team", "Example_Production_Team"]
```

Recommended deployment flow:

1. Confirm the ACW reason code in Finesse Administration.
2. Deploy to a lab or pilot team first.
3. Keep `ENFORCE_TEAM` set to `false` until the gadget confirms the expected team name is returned by the User API.
4. Enable team enforcement only after validation.
5. Review Finesse logs and browser console output during pilot testing.

## Security notes

This repository intentionally does not include company names, internal hostnames, IP addresses, credentials, tokens, production usernames, or screenshots. Do not publish deployment screenshots, browser logs, or Finesse output that contain real agent IDs, extensions, hostnames, team names, customer information, or business-specific routing details.

## Important disclaimer

This sample is provided as a generic engineering example. Review it with your organization's change-management, security, compliance, and intellectual-property requirements before using or publishing it.
