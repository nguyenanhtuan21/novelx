import json


def get_health() -> dict[str, str]:
    return {
        "service": "ai-factory",
        "status": "ok",
    }


if __name__ == "__main__":
    print(json.dumps(get_health(), sort_keys=True))
