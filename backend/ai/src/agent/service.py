from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

from src.agent.prompt_template import SHOP_AGENT_SYSTEM_PROMPT
from src.agent.tools import get_all_tools
from src.providers.base import ProviderResult


class AgentService:
    def __init__(self, model: BaseChatModel) -> None:
        self.model = model
        self.agent = create_agent(model=model, tools=get_all_tools())

    def chat(self, shop_id: str, message: str) -> ProviderResult:
        result = self.agent.invoke(
            {
                "messages": [
                    {
                        "role": "system",
                        "content": SHOP_AGENT_SYSTEM_PROMPT.format(shop_id=shop_id),
                    },
                    {"role": "user", "content": message},
                ]
            }
        )
        last = result["messages"][-1]
        model_name = getattr(self.model, "model_name", "")
        version = (getattr(last, "response_metadata", None) or {}).get(
            "model_name", model_name
        )
        return ProviderResult(text=last.text, model=model_name, model_version=version)
