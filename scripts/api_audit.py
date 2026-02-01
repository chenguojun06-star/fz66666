import os
import re
import sys

def find_backend_endpoints(backend_root):
    endpoints = []
    # Regex for class-level RequestMapping
    class_mapping_pattern = re.compile(r'@RequestMapping\s*\(\s*["\']([^"\']+)["\']')
    # Regex for method-level mappings
    method_mapping_pattern = re.compile(r'@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\']')

    for root, dirs, files in os.walk(backend_root):
        for file in files:
            if file.endswith('.java'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Find class mapping
                class_prefix = ""
                class_match = class_mapping_pattern.search(content)
                if class_match:
                    class_prefix = class_match.group(1).strip('/')

                # Find method mappings
                for match in method_mapping_pattern.finditer(content):
                    method_type = match.group(1)
                    method_path = match.group(2).strip('/')

                    full_path = f"/{class_prefix}/{method_path}" if class_prefix else f"/{method_path}"
                    full_path = full_path.replace('//', '/')
                    endpoints.append(full_path)

    return set(endpoints)

def find_frontend_calls(frontend_root):
    calls = []
    # Regex for api calls: api.get('/path' or api.post(`/path`
    api_pattern = re.compile(r'api\.(get|post|put|delete|patch)\s*\(\s*(?:[\'"`])([^"\'`]+)(?:[\'"`])')

    for root, dirs, files in os.walk(frontend_root):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    try:
                        content = f.read()
                        for match in api_pattern.finditer(content):
                            method = match.group(1)
                            url = match.group(2)
                            # Normalize URL
                            # Replace ${...} with {param} for better matching
                            url = re.sub(r'\$\{[^}]+\}', '{param}', url)
                            if not url.startswith('http'): # Ignore absolute URLs
                                calls.append((url, path))
                    except:
                        pass
    return calls

def match_url(frontend_url, backend_endpoints):
    # Normalize frontend URL: replace ${...} with {param}
    # (Already done in find_frontend_calls)

    # We want to see if 'frontend_url' matches any 'backend_endpoint' pattern.

    # Strategy: convert BOTH to a common pattern where variables are just *
    # /api/style/info/{id} -> /api/style/info/*
    # /style/info/{param} -> /style/info/*

    f_path = re.sub(r'\{[^}]+\}', '*', frontend_url)
    # Also handle standard param string: ?foo=bar
    if '?' in f_path:
        f_path = f_path.split('?')[0]

    for backend_ep in backend_endpoints:
        b_path = re.sub(r'\{[^}]+\}', '*', backend_ep)

        # 1. Direct match
        if f_path == b_path:
            return backend_ep

        # 2. Frontend missing /api
        if not f_path.startswith('/api') and b_path == "/api" + f_path:
            return backend_ep

        # 3. Backend missing /api (unlikely but possible)
        if f_path == "/api" + b_path:
            return backend_ep

        # 4. Strict slash strip match
        if f_path.strip('/') == b_path.strip('/'):
             return backend_ep

        # 5. Frontend missing /api and slash strip
        if f_path.strip('/') == b_path.replace('/api', '', 1).strip('/'):
             return backend_ep

    return None

def load_adapter_rules(adapter_path):
    rules = []
    # Regex to extract keys from DEPRECATED_ENDPOINTS object
    # Matches: '/some/path': or 'POST /some/path':
    rule_pattern = re.compile(r"^\s*['\"]((?:POST |GET |PUT |DELETE )?\/[^'\"]+)['\"]\s*:")

    try:
        with open(adapter_path, 'r', encoding='utf-8') as f:
            for line in f:
                match = rule_pattern.match(line)
                if match:
                    rules.append(match.group(1))
    except FileNotFoundError:
        print(f"Warning: Adapter file not found at {adapter_path}")

    return rules

def check_adapter_match(url, rules):
    # url: /production/order/by-order-no/123
    # rule: /production/order/by-order-no/:orderNo

    # Normalize url (remove /api if present at start)
    url_clean = url
    if url.startswith('/api'):
        url_clean = url[4:]

    for rule in rules:
        # Separate method if present
        rule_path = rule
        if ' ' in rule:
            rule_path = rule.split(' ')[1]

        # Convert rule to regex
        # :param -> [^/]+
        # * -> .*
        rule_regex = re.escape(rule_path).replace(r'\:orderNo', r'[^/]+').replace(r'\:id', r'[^/]+').replace(r'\*', r'.*')
        # Handle generic :param
        rule_regex = re.sub(r'\\\:[a-zA-Z0-9]+', r'[^/]+', rule_regex)

        rule_regex = "^" + rule_regex + "$"

        if re.match(rule_regex, url_clean):
            return rule

    return None

def main():
    backend_root = "/Users/guojunmini4/Documents/服装66666/backend/src"
    frontend_root = "/Users/guojunmini4/Documents/服装66666/frontend/src"
    adapter_path = "/Users/guojunmini4/Documents/服装66666/frontend/src/utils/api/legacyApiAdapter.ts"

    print("Scanning backend endpoints...")
    backend_endpoints = find_backend_endpoints(backend_root)
    # Debug: Print some backend endpoints
    print("Sample Backend Endpoints:")
    for ep in list(backend_endpoints)[:5]:
        print(f"  {ep}")
    print(f"Total Backend Endpoints: {len(backend_endpoints)}")

    print("Loading Adapter Rules...")
    adapter_rules = load_adapter_rules(adapter_path)
    print(f"Total Adapter Rules: {len(adapter_rules)}")

    print("Scanning frontend API calls...")
    frontend_calls = find_frontend_calls(frontend_root)
    print(f"Total Frontend API Calls: {len(frontend_calls)}")

    print("\nAnalyzing matches...")
    matched_count = 0
    adapter_handled_count = 0
    mismatched = []

    for url, file_path in frontend_calls:
        match = match_url(url, backend_endpoints)
        if match:
            matched_count += 1
        else:
            # Check adapter
            adapter_rule = check_adapter_match(url, adapter_rules)
            if adapter_rule:
                adapter_handled_count += 1
            else:
                mismatched.append((url, file_path))

    print(f"Matched (Direct): {matched_count}")
    print(f"Matched (Adapter): {adapter_handled_count}")
    print(f"Potential Issues: {len(mismatched)}")

    print("\n=== POTENTIAL BROKEN LINKS ===")
    seen = set()
    for url, path in mismatched:
        if url not in seen:
            rel_path = path.split('/frontend/src/')[-1]
            print(f"[MISSING] {url}")
            seen.add(url)

if __name__ == "__main__":
    main()
