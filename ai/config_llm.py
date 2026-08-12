#!/usr/bin/env python3
"""
criptobot/ai/config_llm.py
Fase 4: Conector Unificado a LLM para Criptobot v3.0

Soporta:
1. OpenRouter API con `nvidia/nemotron-3.5-lightning:free` (Primario)
2. OpenRouter API con `google/gemma-4-26b-a4b-it:free` (Fallback 1)
3. DeepSeek API Nativa con `deepseek-chat` (Fallback 2)
"""

import os
import json
import urllib.request
import urllib.error

# Cargar API Keys desde el entorno o desde /home/anton/.hermes/.env si aplica
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")

if not OPENROUTER_API_KEY or not DEEPSEEK_API_KEY:
    hermes_env = "/home/anton/.hermes/.env"
    if os.path.exists(hermes_env):
        with open(hermes_env, "r") as f:
            for line in f:
                if line.startswith("OPENROUTER_API_KEY=") and not OPENROUTER_API_KEY:
                    OPENROUTER_API_KEY = line.strip().split("=", 1)[1]
                elif line.startswith("DEEPSEEK_API_KEY=") and not DEEPSEEK_API_KEY:
                    DEEPSEEK_API_KEY = line.strip().split("=", 1)[1]

MODELS_ORDER = [
    ("openrouter", "nvidia/nemotron-3.5-lightning:free"),
    ("openrouter", "google/gemma-4-26b-a4b-it:free"),
    ("deepseek", "deepseek-chat")
]

def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1000, temperature: float = 0.2) -> str:
    """Llama a un modelo LLM usando NVIDIA Nemotron (OpenRouter) o DeepSeek como fallback."""
    for provider, model_name in MODELS_ORDER:
        try:
            if provider == "openrouter" and OPENROUTER_API_KEY:
                url = "https://openrouter.ai/api/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://criptobot.v3",
                    "X-Title": "Criptobot HFT AI Engine"
                }
                payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature
                }
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
                with urllib.request.urlopen(req, timeout=20) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        content = data['choices'][0]['message']['content']
                        if content:
                            return content.strip()

            elif provider == "deepseek" and DEEPSEEK_API_KEY:
                url = "https://api.deepseek.com/chat/completions"
                headers = {
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature
                }
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
                with urllib.request.urlopen(req, timeout=20) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        content = data['choices'][0]['message']['content']
                        if content:
                            return content.strip()
        except Exception as e:
            # Intentar el siguiente modelo en caso de error
            continue

    return ""

if __name__ == "__main__":
    print("🧪 Probando conector de IA config_llm.py con NVIDIA Nemotron...")
    sys_p = "Eres un asistente cuantitativo experto en HFT."
    usr_p = "Responde brevemente: ¿Conexión establecida?"
    res = call_llm(sys_p, usr_p)
    print(f"Respuesta de IA: {res}")
