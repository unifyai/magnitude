## Deploying Molmo vLLM Server on Modal

### Modal Setup
Before deploying anything you'll need to create an account on [Modal](https://modal.com) and set up your modal package. See https://modal.com/docs/guide for instructions.

### Downloading Molmo
Run the following to download Molmo 7B and cache it in a Modal volume to use in your deployment:
```sh
modal run download_molmo.py
```

### Secret Configuration
The deploy script looks for a secret called `vllm-api-key` to use as an API key for the vLLM OpenAI-compatible server. Create one here https://modal.com/secrets. You can use any value, but make sure to keep track of it.

You'll need the `vllm-api-key` in this environment variable locally:
```sh
export MOLMO_VLLM_API_KEY=<your-vllm-api-key>
```

### Deploying

```sh
modal deploy molmo_vllm.py
```

### Cold-starts
Modal containers scale to 0 when not in use - but this means it takes 1-2 minutes to boot up when not in use after a while - meaning your test cases will be delayed if you haven't run tests in the past 20 minutes.

To eliminate cold-starts, add `min_containers` param to `molmo_vllm.py` and redeploy:
```python
@app.function(
    ...
    # Add this:
    min_containers=1
)
```
This will ensure that one container (and GPU) stays warm at all times.
Be advised that this will quickly use your available credits on Modal (around ~$800/mo with 1xA10G).

We are working with cloud providers to get Molmo 7B hosted as an inference endpoint so that you can choose to self-host without dealing with cold starts or expensive monthly costs.

You can also use our hosted version to avoid these challenges.
