# Deployment Notes

## Files

Use `src/AutoReadyACW.xml` as the gadget entry point. Keep `AutoReadyACW.xml`, `AutoReadyACW.js`, and `AutoReadyACW.css` in the same hosted gadget directory.

## Finesse behavior

The gadget uses the logged-in Finesse user context when available. If the user ID is not passed into the gadget context, a manual test field is displayed for pilot validation.

## Validation checklist

1. Confirm the ACW Not Ready reason code in Finesse Administration.
2. Validate the gadget in a lab environment.
3. Test with one pilot team before production rollout.
4. Confirm the agent is only moved to `READY` after the configured ACW timer.
5. Confirm the gadget does not act when the agent leaves ACW before the timer expires.
6. Enable team enforcement only after confirming that Finesse returns the expected team name.
7. Monitor browser console and Finesse logs during pilot testing.

## Rollback

Remove the gadget from the Finesse desktop layout or disable the gadget URL from the pilot layout.
