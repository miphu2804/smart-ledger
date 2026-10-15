import asyncio

from pydantic_ai.embeddings.test import TestEmbeddingModel

from src.memory.workers_ai_embedding import WorkersAIEmbeddingModel


def workers_ai(model_name: str, native_dimensions: int) -> WorkersAIEmbeddingModel:
    model = WorkersAIEmbeddingModel(
        model_name, account_id="account", api_token="token", dimensions=4
    )
    model.wrapped = TestEmbeddingModel(model_name, dimensions=native_dimensions)
    return model


def test_query_and_document_get_the_model_prompts_and_the_stored_size():
    model = workers_ai("@cf/google/embeddinggemma-300m", native_dimensions=768)

    query = asyncio.run(model.embed("Gas còn mấy bình?", input_type="query"))
    documents = asyncio.run(
        model.embed(["Gas giao tận nơi.", "Chốt sổ lúc 22 giờ."], input_type="document")
    )

    assert query.inputs == ["task: search result | query: Gas còn mấy bình?"]
    assert documents.inputs == [
        "title: none | text: Gas giao tận nơi.",
        "title: none | text: Chốt sổ lúc 22 giờ.",
    ]
    assert [len(vector) for vector in documents.embeddings] == [4, 4]


def test_a_model_without_prompts_gets_the_bare_text():
    model = workers_ai("@cf/baai/bge-m3", native_dimensions=1024)

    result = asyncio.run(model.embed("Gas còn mấy bình?", input_type="query"))

    assert result.inputs == ["Gas còn mấy bình?"]
