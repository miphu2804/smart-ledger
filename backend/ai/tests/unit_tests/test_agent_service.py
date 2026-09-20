import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from src.agent.service import AgentService


class RecordingChatModel(FakeListChatModel):
    seen_messages: list = []

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_messages = list(messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class ErrorChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("down")


def test_chat_builds_system_prompt_with_shop_id() -> None:
    model = RecordingChatModel(responses=["ok"])
    agent = AgentService(model)

    result = agent.chat(shop_id="shop-1", message="doanh thu hôm nay?")

    assert result.text == "ok"
    assert model.seen_messages[0].type == "system"
    assert "shop-1" in model.seen_messages[0].content
    assert model.seen_messages[-1].content == "doanh thu hôm nay?"


def test_chat_propagates_model_error() -> None:
    agent = AgentService(ErrorChatModel(responses=[]))

    with pytest.raises(RuntimeError):
        agent.chat(shop_id="s", message="m")
