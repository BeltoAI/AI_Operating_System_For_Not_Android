# Model Router

Cross-platform model routing should preserve the Android idea:

- cheap model for ordinary replies and classification
- stronger model for deep reasoning, papers, plans, and complex tool use
- vision model for images/screenshots/receipts
- embedding model for memory retrieval
- optional local model when the device can run it safely

The router should expose a stable request envelope:

```json
{
  "task": "reply",
  "inputs": [],
  "needs_web": false,
  "needs_vision": false,
  "privacy": "local_ok",
  "budget": "cheap"
}
```

Platform code should not hard-code provider behavior. It should call the shared router contract and render the result.

