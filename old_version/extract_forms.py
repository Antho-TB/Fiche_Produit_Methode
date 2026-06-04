import urllib.request
import re

url2 = "https://docs.google.com/forms/d/e/1FAIpQLSf8_40my2WTUGvhh_KlOwOW6BfpUMdFQiRAUklElWiqttOrGQ/viewform"
url1 = "https://docs.google.com/forms/d/e/1FAIpQLScOMF325mhRHCOs_r0hqfujwP3j7k1l3mTlz-pwRxrXCph_8Q/viewform"

def parse_form(url, name):
    print(f"\n--- FORM {name} ---")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        # Google Forms data is in FB_PUBLIC_LOAD_DATA_
        match = re.search(r'var FB_PUBLIC_LOAD_DATA_ = (\[.*?\]);\n', html, re.DOTALL)
        if match:
            import json
            data = json.loads(match.group(1))
            questions = data[1][1]
            for q in questions:
                q_id = q[0]
                q_title = q[1]
                entry_id = q[4][0][0] if q[4] else "N/A"
                print(f"Title: {q_title}")
                print(f"entry.{entry_id}")
                print("-")
    except Exception as e:
        print(f"Error: {e}")

parse_form(url2, "2 (Decision)")
parse_form(url1, "1 (Depot)")
