from __future__ import annotations

from openai import OpenAI


class OpenAIService:
    def __init__(self, api_key: str, embed_model: str, chat_model: str) -> None:
        self._client = OpenAI(api_key=api_key)
        self._embed_model = embed_model
        self._chat_model = chat_model

    @property
    def embed_model(self) -> str:
        return self._embed_model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        response = self._client.embeddings.create(model=self._embed_model, input=texts)
        return [item.embedding for item in response.data]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def chat_with_context(self, query: str, contexts: list[str]) -> str:
        system_prompt = (
            "You are a venue recommendation assistant for Ho Chi Minh City. "
            "Use only the retrieved review context. Recommend 2 to 4 places, "
            "explain why each matches, and mention concrete details from the reviews. "
            "If the matches are weak, say so clearly."
        )
        joined_context = "\n".join(f"{idx + 1}. {item}" for idx, item in enumerate(contexts))
        response = self._client.chat.completions.create(
            model=self._chat_model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"User request: {query}\n\nRetrieved reviews:\n{joined_context}"},
            ],
        )
        return (response.choices[0].message.content or "").strip()
