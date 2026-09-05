# Behaviors

## Interaction
Links/buttons have visible hover, active, disabled, loading, and keyboard focus states. Touch targets are at least 44px where used on touch surfaces.

## Loading and state
Use stable skeletons for structured content and a compact spinner only for bounded actions. Empty/error states explain what happened and the next action. Toasts are action feedback, not the sole persistent error state.

## Forms
Visible labels; validate at submit and field blur where useful; errors appear beside the relevant field. Disable duplicate submission and expose busy state.

## Motion
Animate opacity/transform sparingly. Never animate layout dimensions for routine page load. Honor `prefers-reduced-motion` globally.
