# ---
# cmd: ["modal", "serve", "molmo_vllm.py"]
# pytest: false
# ---

import os
import modal

# Create an image with all required dependencies
molmo_image = modal.Image.debian_slim(python_version="3.10").pip_install(
    "vllm==0.8.3", 
    "fastapi[standard]==0.115.4",
    "transformers>=4.42.0",
    "torch>=2.0.0",
    "accelerate",  # Helps with model loading
    "pillow",  # For image processing
    #force_build=True
)

MODELS_DIR = "/molmo"
MODEL_NAME = "allenai/Molmo-7B-D-0924"
MODEL_REVISION = "main"

# Try to get the volume, or raise an exception if it doesn't exist
try:
    volume = modal.Volume.from_name("molmo", create_if_missing=False).hydrate()
except modal.exception.NotFoundError:
    raise Exception("Download model first with modal run download_molmo.py")

app = modal.App("molmo-vllm")

N_GPU = 1

MINUTES = 60  # seconds
HOURS = 60 * MINUTES

@app.function(
    image=molmo_image,
    gpu="A10G",
    container_idle_timeout=20 * MINUTES,
    timeout=24 * HOURS,
    allow_concurrent_inputs=1000,
    volumes={MODELS_DIR: volume},
    enable_memory_snapshot=True,
    secrets=[modal.Secret.from_name("vllm-api-key")]
)
@modal.asgi_app()
def serve():
    import fastapi
    import vllm.entrypoints.openai.api_server as api_server
    from vllm.engine.arg_utils import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.entrypoints.logger import RequestLogger
    from vllm.entrypoints.openai.serving_chat import OpenAIServingChat
    from vllm.entrypoints.openai.serving_completion import OpenAIServingCompletion
    from vllm.entrypoints.openai.serving_engine import BaseModelPath
    from vllm.usage.usage_lib import UsageContext

    volume.reload()  # ensure we have the latest version of the model

    # create a fastAPI app that uses vLLM's OpenAI-compatible router
    web_app = fastapi.FastAPI(
        title=f"OpenAI-compatible {MODEL_NAME} server",
        version="0.0.1",
        docs_url="/docs",
    )

    # security: CORS middleware for external requests
    http_bearer = fastapi.security.HTTPBearer(
        scheme_name="Bearer Token",
        description="See code for authentication details.",
    )
    web_app.add_middleware(
        fastapi.middleware.cors.CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # security: inject dependency on authed routes
    async def is_authenticated(api_key: str = fastapi.Security(http_bearer)):
        if api_key.credentials != os.environ['VLLM_API_KEY']:
            raise fastapi.HTTPException(
                status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
        return {"username": "authenticated_user"}

    router = fastapi.APIRouter(dependencies=[fastapi.Depends(is_authenticated)])

    # wrap vllm's router in auth router
    router.include_router(api_server.router)
    # add authed vllm to our fastAPI app
    web_app.include_router(router)

    engine_args = AsyncEngineArgs(
        model=MODELS_DIR + "/" + MODEL_NAME,
        tensor_parallel_size=N_GPU,
        gpu_memory_utilization=0.90,
        max_model_len=4096,
        enforce_eager=False,  # capture the graph for faster inference, but slower cold starts
        # Note: For multimodal models, we may need additional parameters
        # You might need to check vLLM docs for latest multimodal support
        trust_remote_code=True,
        # Optimizations
        dtype="bfloat16",  # Use bfloat16 instead of float32
        quantization=None,  # No additional quantization beyond bf16
    )

    engine = AsyncLLMEngine.from_engine_args(
        engine_args, usage_context=UsageContext.OPENAI_API_SERVER
    )

    model_config = get_model_config(engine)

    request_logger = RequestLogger(max_log_len=2048)

    base_model_paths = [
        BaseModelPath(name=MODEL_NAME.split("/")[1], model_path=MODEL_NAME)
    ]

    api_server.chat = lambda s: OpenAIServingChat(
        engine,
        model_config=model_config,
        base_model_paths=base_model_paths,
        chat_template=None,
        response_role="assistant",
        lora_modules=[],
        prompt_adapters=[],
        request_logger=request_logger,
    )
    api_server.completion = lambda s: OpenAIServingCompletion(
        engine,
        model_config=model_config,
        base_model_paths=base_model_paths,
        lora_modules=[],
        prompt_adapters=[],
        request_logger=request_logger,
    )

    return web_app


def get_model_config(engine):
    import asyncio

    try:  # adapted from vLLM source
        event_loop = asyncio.get_running_loop()
    except RuntimeError:
        event_loop = None

    if event_loop is not None and event_loop.is_running():
        # If the current is instanced by Ray Serve,
        # there is already a running event loop
        model_config = event_loop.run_until_complete(engine.get_model_config())
    else:
        # When using single vLLM without engine_use_ray
        model_config = asyncio.run(engine.get_model_config())

    return model_config
