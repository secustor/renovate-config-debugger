# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "requests==2.32.3",
#   "rich==13.7.1",
# ]
# ///

import requests

print(requests.get("https://example.com").status_code)
