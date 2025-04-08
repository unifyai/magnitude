// Learn more about clients at https://docs.boundaryml.com/docs/snippets/clients/overview

client<llm> Macro {
    provider aws-bedrock
    options {
        inference_configuration {
            temperature 0.0
        }
        model_id "anthropic.claude-3-5-sonnet-20240620-v1:0"
    }
}

// client<llm> Macro {
//     provider anthropic
//     options {
//         model "claude-3-5-sonnet-20241022"
//         api_key env.ANTHROPIC_API_KEY
//         temperature 0.0
//     }
// }

client<llm> Molmo {
    provider "openai-generic"
    options {
        base_url env.MOLMO_VLLM_BASE_URL
        api_key env.MOLMO_VLLM_API_KEY
        model "Molmo-7B-D-0924"
        temperature 0.0
        logprobs true
    }
}
