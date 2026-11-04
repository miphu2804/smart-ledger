from evaluation.core.schema import Case


def question_of(case: Case) -> str:
    """The question the answer is for: the follow-up when the case has one."""
    return case.inputs["follow_up"] or case.inputs["question"]
