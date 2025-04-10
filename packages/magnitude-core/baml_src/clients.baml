// Learn more about clients at https://docs.boundaryml.com/docs/snippets/clients/overview

client<llm> SonnetBedrock {
    provider aws-bedrock
    retry_policy Exponential
    options {
        inference_configuration {
            temperature 0.0
        }
        model_id "anthropic.claude-3-5-sonnet-20240620-v1:0"
    }
}

client<llm> SonnetAnthropic {
    provider anthropic
    retry_policy Exponential
    options {
        model "claude-3-5-sonnet-20240620"
        api_key env.ANTHROPIC_API_KEY
        temperature 0.0
    }
}

// client<llm> Macro {
//     provider openai
//     options {
//         model "gpt-4o"
//         api_key env.OPENAI_API_KEY
//         temperature 0.0
//     }
// }

client<llm> NovitaLlamaMaverick {
    provider "openai-generic"
    retry_policy Exponential
    options {
        base_url "https://api.novita.ai/v3/openai"
        api_key env.NOVITA_API_KEY
        model "meta-llama/llama-4-maverick-17b-128e-instruct-fp8"
        temperature 0.0
        logprobs true
    }
}

client<llm> Molmo {
    provider "openai-generic"
    retry_policy Exponential
    options {
        base_url env.MOLMO_VLLM_BASE_URL
        api_key env.MOLMO_VLLM_API_KEY
        model "Molmo-7B-D-0924"
        temperature 0.0
        logprobs true
    }
}

retry_policy Exponential {
    max_retries 5
    strategy {
        type exponential_backoff
        delay_ms 500
        mutliplier 2.0
        max_delay_ms 10000
    }
}