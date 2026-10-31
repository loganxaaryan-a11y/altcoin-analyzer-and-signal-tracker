import { spawnSync } from "node:child_process";
import {
definePrivilegedContracts,
definePrivilegedHandlers,
z,
} from "@hatch/space-sdk";

const providerResponse = z.object({
  ok: z.boolean(),
  status: z.number().nullable(),
  data: z.unknown().nullable(),
  creditsCost: z.string().nullable(),
  creditsRemaining: z.string().nullable(),
  error: z.string().nullable(),
});

export const privileged = definePrivilegedContracts({
  elfaRequest: {
    request: z.object({ endpoint: z.enum(["trending_tokens", "trending_contracts", "top_mentions"]), ticker: z.string().trim().min(1).max(30).nullable().default(null), limit: z.number().int().min(1).max(25).default(10) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.elfa", "network.api.elfa.ai"],
    timeoutMs: 90_000,
  },
  nansenRequest: {
    request: z.object({ endpoint: z.enum(["smart_money_netflow", "wallet_pnl"]), chain: z.string().trim().min(1).max(40), symbol: z.string().trim().min(1).max(30).nullable().default(null), address: z.string().trim().min(1).max(120).nullable().default(null), limit: z.number().int().min(1).max(25).default(10) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.nansen", "network.api.nansen.ai"],
    timeoutMs: 120_000,
  },
  altfinsRequest: {
    request: z.object({ endpoint: z.enum(["signals", "screener"]), direction: z.enum(["BULLISH", "BEARISH"]).nullable().default(null), symbols: z.array(z.string().trim().min(1).max(30)).max(25).default([]), limit: z.number().int().min(1).max(25).default(10) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.altfins", "network.altfins.com"],
    timeoutMs: 90_000,
  },
  alchemySolanaRequest: {
    request: z.object({ mint: z.string().trim().min(20).max(80), limit: z.number().int().min(1).max(20).default(10) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.alchemy", "network.solana-mainnet.g.alchemy.com"],
    timeoutMs: 90_000,
  },
  memeRiskRequest: {
    request: z.object({ mint: z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/), topN: z.number().int().min(5).max(12).default(12) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.fluxrpc", "credential.custom.alchemy", "network.eu.fluxrpc.com", "network.solana-mainnet.g.alchemy.com", "network.api.rugcheck.xyz"],
    timeoutMs: 180_000,
  },
  coinstatsRequest: {
    request: z.object({ coinIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.coinstats", "network.api.coinstats.app"],
    timeoutMs: 45_000,
  },
  anchainRequest: {
    request: z.object({ endpoint: z.enum(["label", "risk"]), proto: z.enum(["btc", "eth", "xlm", "xmr", "bnb", "matic", "avax", "sol", "trx", "ada", "dot", "ltc", "bch", "algo", "xrp"]), address: z.string().trim().min(20).max(120) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.anchain-data", "network.api.anchainai.com"],
    timeoutMs: 45_000,
  },
  alchemyEthRequest: {
    request: z.object({ address: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/), limit: z.number().int().min(1).max(20).default(10) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess", "credential.custom.alchemy-eth", "network.eth-mainnet.g.alchemy.com"],
    timeoutMs: 90_000,
  },
  paperPilotFiles: {
    request: z.object({}),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  hyperliquidScannerRun: {
    request: z.object({}),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  assetEvidenceFiles: {
    request: z.object({ symbol: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9.=\-]{0,14}$/) }),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  fundingSeriesStats: {
    request: z.object({}),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  hyperliquidPositioningFiles: {
    request: z.object({}),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  openbbDeribitFiles: {
    request: z.object({}),
    response: z.object({ ok: z.boolean(), status: z.number().nullable(), data: z.unknown().nullable(), creditsCost: z.string().nullable(), creditsRemaining: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 60_000,
  },
  writePaperEnrollmentCanonical: {
    request: z.object({ content: z.string().min(1) }),
    response: z.object({ ok: z.boolean(), bytes: z.number().nullable(), writtenAtUtc: z.string().nullable(), error: z.string().nullable() }),
    capabilities: ["subprocess"],
    timeoutMs: 120_000,
  },
});

const PYTHON_PROVIDER = String.raw`
import datetime, json, sys, urllib.parse, urllib.request, urllib.error
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, dynamic_credential_entry, ensure_allowed_url, read_json_response, url_with_surrogate_query_param

payload = json.loads(sys.stdin.read())
provider = payload.get("provider")
endpoint = payload.get("endpoint")
limit = int(payload.get("limit") or 10)
credits_cost = None
credits_remaining = None

def rpc_url(host, connector):
    template = f"https://{host}/v2/{{}}"
    ensure_allowed_url(template, [host])
    entry = dynamic_credential_entry(connector, "access_token")
    placement = entry.get("placement")
    if not (isinstance(placement, dict) and "url_path_segment" in placement):
        raise RuntimeError("provider credential is not configured for URL-path placement")
    surrogate = urllib.parse.quote(str(entry["surrogate"]).strip(), safe=":")
    return template.replace("{}", surrogate, 1)

def rpc(url, method, params):
    body = {"jsonrpc":"2.0","id":1,"method":method,"params":params}
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type":"application/json","Accept":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        out = read_json_response(resp)
    if out.get("error"):
        raise RuntimeError("provider RPC rejected request")
    return out.get("result")

if provider == "elfa":
    base = "https://api.elfa.ai"
    if endpoint == "trending_tokens":
        path, params = "/v2/aggregations/trending-tokens", {"timeWindow":"24h","pageSize":limit}
    elif endpoint == "trending_contracts":
        path, params = "/v2/aggregations/trending-cas/twitter", {"timeWindow":"24h","pageSize":limit}
    elif endpoint == "top_mentions":
        ticker = str(payload.get("ticker") or "").strip().upper()
        if not ticker: raise ValueError("ticker is required")
        path, params = "/v2/data/top-mentions", {"ticker":ticker,"timeWindow":"24h","pageSize":limit}
    else: raise ValueError("unsupported Elfa endpoint")
    req = urllib.request.Request(base + path + "?" + urllib.parse.urlencode(params), headers={"Accept":"application/json"})
    add_surrogate_to_request(req, "custom.elfa", allowed_hosts=["api.elfa.ai"])
elif provider == "nansen":
    base = "https://api.nansen.ai"
    chain = str(payload.get("chain") or "ethereum").strip().lower()
    if endpoint == "smart_money_netflow":
        path = "/api/v1/smart-money/netflow"
        body = {"chains":[chain],"pagination":{"page":1,"per_page":limit},"order_by":[{"field":"net_flow_24h_usd","direction":"DESC"}]}
    elif endpoint == "wallet_pnl":
        address = str(payload.get("address") or "").strip()
        if not address: raise ValueError("wallet address is required")
        path = "/api/v1/profiler/address/pnl-summary"
        today = datetime.datetime.now(datetime.timezone.utc).date()
        body = {"wallet_address":address,"chain":chain,"date":{"from":(today-datetime.timedelta(days=365)).isoformat(),"to":today.isoformat()}}
    else: raise ValueError("unsupported Nansen endpoint")
    req = urllib.request.Request(base + path, data=json.dumps(body).encode("utf-8"), headers={"Content-Type":"application/json","Accept":"application/json"}, method="POST")
    add_surrogate_to_request(req, "custom.nansen", allowed_hosts=["api.nansen.ai"])
elif provider == "altfins":
    base = "https://altfins.com"
    headers = {"Accept":"application/json","Content-Type":"application/json","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
    if endpoint == "signals":
        path = "/api/v2/public/signals-feed/search-requests"
        body = {"direction":payload.get("direction") or "BULLISH","page":0,"size":limit}
    elif endpoint == "screener":
        path = "/api/v2/public/screener-data/search-requests"
        body = {"symbols":payload.get("symbols") or [],"timeInterval":"DAILY","page":0,"size":limit,"filters":{}}
    else: raise ValueError("unsupported altFINS endpoint")
    req = urllib.request.Request(base + path, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    add_surrogate_to_request(req, "custom.altfins", allowed_hosts=["altfins.com"])
elif provider == "meme_risk":
    mint = str(payload.get("mint") or "").strip()
    top_n = min(12, max(5, int(payload.get("topN") or 12)))
    if not mint: raise ValueError("mint is required")
    flux_url = url_with_surrogate_query_param("https://eu.fluxrpc.com/", "custom.fluxrpc", allowed_hosts=("eu.fluxrpc.com",))

    def flux(method, params=None):
        body = {"jsonrpc":"2.0","id":1,"method":method,"params":params or []}
        request = urllib.request.Request(flux_url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"Mozilla/5.0"}, method="POST")
        with urllib.request.urlopen(request, timeout=45) as response:
            answer = read_json_response(response)
        if answer.get("error"):
            raise RuntimeError("FluxRPC rejected " + method)
        return answer.get("result")

    B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    def b58decode(value):
        number = 0
        for char in value:
            number = number * 58 + B58.index(char)
        raw = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
        return b"\x00" * (len(value) - len(value.lstrip("1"))) + raw

    def is_on_curve(address):
        try:
            raw = b58decode(address)
            if len(raw) != 32: return False
            p = 2**255 - 19
            d = (-121665 * pow(121666, p - 2, p)) % p
            y = int.from_bytes(raw, "little") & ((1 << 255) - 1)
            if y >= p: return False
            y2 = y * y % p
            x2 = (y2 - 1) * pow((d * y2 + 1) % p, p - 2, p) % p
            x = pow(x2, (p + 3) // 8, p)
            if (x * x - x2) % p != 0:
                x = x * pow(2, (p - 1) // 4, p) % p
            return (x * x - x2) % p == 0
        except Exception:
            return False

    alchemy_url = None
    try:
        alchemy_url = rpc_url("solana-mainnet.g.alchemy.com", "custom.alchemy")
    except Exception:
        alchemy_url = None

    def rpc_many_url(url, calls, timeout=15):
        def request_one(index, method, params):
            body = {"jsonrpc":"2.0","id":index + 1,"method":method,"params":params or []}
            request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"Mozilla/5.0"}, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    answer = read_json_response(response)
                return None if not isinstance(answer, dict) or answer.get("error") else answer.get("result")
            except Exception:
                return None
        if not calls: return []
        with ThreadPoolExecutor(max_workers=min(6, len(calls))) as pool:
            futures = [pool.submit(request_one, index, method, params) for index, (method, params) in enumerate(calls)]
            return [future.result() for future in futures]

    def flux_many(calls, timeout=15):
        return rpc_many_url(flux_url, calls, timeout)

    history_telemetry = {"fluxEmptyOrFailed":0,"alchemyFallbackCalls":0,"alchemyFallbackUsable":0,"alchemyConfigured":bool(alchemy_url)}
    def funding_many(calls, fallback_on_empty=False):
        primary = flux_many(calls)
        providers = ["fluxrpc" if item is not None and (not fallback_on_empty or item != []) else None for item in primary]
        missing = [index for index, item in enumerate(primary) if item is None or (fallback_on_empty and item == [])]
        history_telemetry["fluxEmptyOrFailed"] += len(missing)
        if missing and alchemy_url:
            history_telemetry["alchemyFallbackCalls"] += len(missing)
            replacements = rpc_many_url(alchemy_url, [calls[index] for index in missing])
            for replacement_index, original_index in enumerate(missing):
                replacement = replacements[replacement_index] if replacement_index < len(replacements) else None
                if replacement is not None:
                    primary[original_index] = replacement
                    providers[original_index] = "alchemy"
                    history_telemetry["alchemyFallbackUsable"] += 1
        return primary, providers

    def read_rugcheck(suffix):
        try:
            rug_url = "https://api.rugcheck.xyz/v1/tokens/" + urllib.parse.quote(mint, safe="") + suffix
            ensure_allowed_url(rug_url, ["api.rugcheck.xyz"])
            rug_req = urllib.request.Request(rug_url, headers={"Accept":"application/json","User-Agent":"Mozilla/5.0"})
            with urllib.request.urlopen(rug_req, timeout=6) as rug_resp:
                return read_json_response(rug_resp), None
        except urllib.error.HTTPError as rug_exc:
            return None, "RugCheck unavailable (HTTP " + str(rug_exc.code) + ")"
        except Exception:
            return None, "RugCheck unavailable"

    from concurrent.futures import ThreadPoolExecutor
    rug_summary = None
    rug_report = None
    rug_error = None
    initial_error = None
    supply_raw = None
    largest_raw = None
    try:
        with ThreadPoolExecutor(max_workers=3) as pool:
            summary_future = pool.submit(read_rugcheck, "/report/summary")
            report_future = pool.submit(read_rugcheck, "/report")
            flux_future = pool.submit(flux_many, [("getTokenSupply", [mint]), ("getTokenLargestAccounts", [mint])])
            rug_summary, summary_error = summary_future.result()
            rug_report, report_error = report_future.result()
            rug_error = summary_error or report_error
            initial = flux_future.result()
            supply_raw = initial[0] if len(initial) > 0 else None
            largest_raw = initial[1] if len(initial) > 1 else None
    except Exception:
        initial_error = "FluxRPC token snapshot unavailable"

    supply_raw = supply_raw or {}
    supply_value = ((supply_raw.get("value") or {}).get("uiAmount"))
    if supply_value is None:
        amount_raw = (supply_raw.get("value") or {}).get("amount")
        decimals = int((supply_raw.get("value") or {}).get("decimals") or 0)
        supply_value = (float(amount_raw) / (10 ** decimals)) if amount_raw is not None else 0
    largest = ((largest_raw or {}).get("value") or [])[:top_n]

    account_results = []
    holder_count = None
    holder_count_error = None
    try:
        account_calls = [("getAccountInfo", [str(item.get("address") or ""), {"encoding":"jsonParsed"}]) for item in largest]
        account_results = flux_many(account_calls) if account_calls else []
        holder_count_error = "Full holder count omitted: the unpaginated RPC response can exceed the on-demand time budget."
    except Exception:
        holder_count_error = "Holder count unavailable from FluxRPC"

    holder_rows = []
    wallet_indexes = []
    for index, item in enumerate(largest):
        token_account = str(item.get("address") or "")
        amount = item.get("uiAmount")
        if amount is None:
            amount = float(item.get("amount") or 0) / (10 ** int(item.get("decimals") or 0))
        info = account_results[index] if index < len(account_results) and isinstance(account_results[index], dict) else {}
        owner = (((((info.get("value") or {}).get("data") or {}).get("parsed") or {}).get("info") or {}).get("owner"))
        on_curve = bool(owner and is_on_curve(str(owner)))
        row = {"wallet":str(owner or token_account),"tokenAccount":token_account,"amount":float(amount or 0),"supplyPct":(float(amount or 0) / float(supply_value) * 100) if supply_value else 0,"funder":None,"funderBalanceSol":None,"onCurve":on_curve,"fundingStatus":"unverified" if on_curve else "excluded"}
        holder_rows.append(row)
        if owner and on_curve: wallet_indexes.append((index, str(owner)))

    signature_results = []
    signature_providers = []
    try:
        signature_results, signature_providers = funding_many([("getSignaturesForAddress", [owner, {"limit":100}]) for _, owner in wallet_indexes], fallback_on_empty=True) if wallet_indexes else ([], [])
    except Exception:
        signature_results = []
        signature_providers = []

    transaction_calls = []
    transaction_slots = []
    for result_index, (row_index, owner) in enumerate(wallet_indexes):
        signatures = signature_results[result_index] if result_index < len(signature_results) and isinstance(signature_results[result_index], list) else None
        holder_rows[row_index]["historyProvider"] = signature_providers[result_index] if result_index < len(signature_providers) else None
        if signatures is None:
            holder_rows[row_index]["fundingStatus"] = "unverified"
        elif not signatures:
            holder_rows[row_index]["fundingStatus"] = "none"
        else:
            earliest = signatures[-1] if isinstance(signatures[-1], dict) else {}
            signature = earliest.get("signature")
            if signature:
                transaction_calls.append(("getTransaction", [signature, {"encoding":"jsonParsed","maxSupportedTransactionVersion":0}]))
                transaction_slots.append((row_index, owner))
            else:
                holder_rows[row_index]["fundingStatus"] = "none"

    transaction_results = []
    transaction_providers = []
    try:
        transaction_results, transaction_providers = funding_many(transaction_calls) if transaction_calls else ([], [])
    except Exception:
        transaction_results = []
        transaction_providers = []

    funders = set()
    for result_index, (row_index, owner) in enumerate(transaction_slots):
        tx = transaction_results[result_index] if result_index < len(transaction_results) and isinstance(transaction_results[result_index], dict) else None
        if tx is None:
            holder_rows[row_index]["fundingStatus"] = "unverified"
            continue
        message = ((tx.get("transaction") or {}).get("message") or {})
        tx_provider = transaction_providers[result_index] if result_index < len(transaction_providers) else None
        if tx_provider == "alchemy": holder_rows[row_index]["historyProvider"] = "alchemy"
        inner = ((tx.get("meta") or {}).get("innerInstructions") or [])
        inner_instructions = [instruction for group in inner if isinstance(group, dict) for instruction in (group.get("instructions") or [])]
        funder = None
        for instruction in (message.get("instructions") or []) + inner_instructions:
            parsed = instruction.get("parsed") if isinstance(instruction, dict) else None
            details = (parsed or {}).get("info") if isinstance(parsed, dict) else None
            if not isinstance(details, dict): continue
            destination = details.get("destination") or details.get("newAccount") or details.get("newAccountPubkey")
            source = details.get("source") or details.get("base")
            if destination == owner and source and source != owner:
                funder = str(source)
                break
        if funder is None:
            for account in message.get("accountKeys") or []:
                if isinstance(account, dict) and account.get("signer") and account.get("pubkey") != owner:
                    funder = str(account.get("pubkey"))
                    break
        holder_rows[row_index]["funder"] = funder
        holder_rows[row_index]["fundingStatus"] = "found" if funder else "none"
        if funder: funders.add(funder)

    if funders:
        funder_list = sorted(funders)
        try:
            balance_results, _balance_providers = funding_many([("getBalance", [funder]) for funder in funder_list])
            for index, funder in enumerate(funder_list):
                balance = balance_results[index] if index < len(balance_results) and isinstance(balance_results[index], dict) else None
                balance_sol = float((balance.get("value") or 0)) / 1_000_000_000 if balance else None
                for row in holder_rows:
                    if row.get("funder") == funder: row["funderBalanceSol"] = balance_sol
        except Exception:
            pass

    if initial_error and not holder_count_error: holder_count_error = initial_error
    print(json.dumps({"ok":True,"status":200,"data":{"mint":mint,"asOf":datetime.datetime.now(datetime.timezone.utc).isoformat(),"rugcheck":{"summary":rug_summary,"report":rug_report,"error":rug_error},"flux":{"supply":float(supply_value or 0),"largestAccounts":holder_rows,"holderCount":holder_count,"holderCountError":holder_count_error or initial_error,"fundingHistory":history_telemetry}},"creditsCost":None,"creditsRemaining":None,"error":None}, separators=(",",":")))
    sys.exit(0)
elif provider == "coinstats":
    base = "https://api.coinstats.app"
    params = {"coinIds": ",".join(payload.get("coinIds") or []), "currency":"USD", "includeRiskScore":"true", "limit":20}
    req = urllib.request.Request(base + "/v1/coins?" + urllib.parse.urlencode(params), headers={"Accept":"application/json"})
    add_surrogate_to_request(req, "custom.coinstats", allowed_hosts=["api.coinstats.app"])
elif provider == "anchain":
    base = "https://api.anchainai.com"
    path = "/api/intel/address/label" if endpoint == "label" else "/api/intel/address/score"
    params = {"proto": str(payload.get("proto") or "eth"), "address": str(payload.get("address") or "")}
    req = urllib.request.Request(base + path + "?" + urllib.parse.urlencode(params), headers={"Accept":"application/json"})
    add_surrogate_to_request(req, "custom.anchain-data", allowed_hosts=["api.anchainai.com"])
elif provider == "alchemy_sol":
    url = rpc_url("solana-mainnet.g.alchemy.com", "custom.alchemy")
    mint = str(payload.get("mint") or "").strip()
    if not mint: raise ValueError("mint is required")
    supply = rpc(url, "getTokenSupply", [mint])
    holders = rpc(url, "getTokenLargestAccounts", [mint])
    print(json.dumps({"ok":True,"status":200,"data":{"mint":mint,"supply":supply,"largestAccounts":(holders or {}).get("value",[])[:limit]},"creditsCost":None,"creditsRemaining":None,"error":None}, separators=(",",":")))
    sys.exit(0)
elif provider == "alchemy_eth":
    url = rpc_url("eth-mainnet.g.alchemy.com", "custom.alchemy-eth")
    address = str(payload.get("address") or "").strip()
    if not address: raise ValueError("address is required")
    transfers = rpc(url, "alchemy_getAssetTransfers", [{"fromBlock":"0x0","toAddress":address,"category":["external","erc20"],"maxCount":hex(limit),"order":"desc"}])
    balances = rpc(url, "alchemy_getTokenBalances", [address,"erc20"])
    print(json.dumps({"ok":True,"status":200,"data":{"address":address,"transfers":(transfers or {}).get("transfers",[]),"tokenBalances":(balances or {}).get("tokenBalances",[])},"creditsCost":None,"creditsRemaining":None,"error":None}, separators=(",",":")))
    sys.exit(0)
else:
    raise ValueError("unsupported provider")

try:
    with urllib.request.urlopen(req, timeout=90) as resp:
        headers = {k.lower():v for k,v in resp.headers.items()}
        data = read_json_response(resp)
        print(json.dumps({"ok":True,"status":getattr(resp,"status",200),"data":data,"creditsCost":headers.get("x-nansen-credits-cost"),"creditsRemaining":headers.get("x-nansen-credits-remaining"),"error":None}, separators=(",",":")))
except urllib.error.HTTPError as exc:
    raw = exc.read(65536).decode("utf-8","replace")
    try: detail = json.loads(raw)
    except Exception: detail = raw[:500]
    print(json.dumps({"ok":False,"status":exc.code,"data":None,"creditsCost":exc.headers.get("x-nansen-credits-cost"),"creditsRemaining":exc.headers.get("x-nansen-credits-remaining"),"error":str(detail)[:500]}, separators=(",",":")))
except Exception as exc:
    print(json.dumps({"ok":False,"status":None,"data":None,"creditsCost":None,"creditsRemaining":None,"error":str(exc)[:500]}, separators=(",",":")))
`;

function runProvider(payload: Record<string, unknown>) {
  const result = spawnSync("python3", ["-c", PYTHON_PROVIDER], { input: JSON.stringify(payload), encoding: "utf8", timeout: 100_000, maxBuffer: 4_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Provider subprocess failed").replace(/hsurr:[A-Za-z0-9:_-]+/g, "[credential]").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Provider returned an unreadable response." }; }
}

const PYTHON_PAPER_FILES = String.raw`
import datetime, json, os, sys

BASE = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot"
errors = {}

def load_json(rel):
    try:
        with open(os.path.join(BASE, rel), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        errors[rel] = type(exc).__name__ + ": " + str(exc)
        return None

positions = load_json("monitoring/positions.json") or []
mon_state = load_json("monitoring/state.json") or {}
md_state = load_json("marketdata/state.json") or {}

latest_obs = {}
try:
    with open(os.path.join(BASE, "monitoring/observations.jsonl"), "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            pid = rec.get("position_id")
            if pid:
                latest_obs[pid] = rec
except Exception as exc:
    errors["monitoring/observations.jsonl"] = type(exc).__name__ + ": " + str(exc)

def summarize_obs(rec):
    first = {}
    counts = {}
    for t in (rec.get("touches") or []):
        barrier = t.get("barrier")
        if not barrier:
            continue
        counts[barrier] = counts.get(barrier, 0) + 1
        current = first.get(barrier)
        if current is None or (t.get("bar_open_utc") or "") < (current.get("bar_open_utc") or ""):
            first[barrier] = {"barrier": barrier, "bar_open_utc": t.get("bar_open_utc"), "level": t.get("level"), "extreme": t.get("extreme")}
    gaps = [{"from_utc": g.get("from_utc"), "to_utc": g.get("to_utc")} for g in (rec.get("gaps") or [])[:20]]
    return {
        "position_id": rec.get("position_id"), "symbol": rec.get("symbol"), "venue": rec.get("venue"),
        "observed_at_utc": rec.get("observed_at_utc"),
        "window_from_utc": rec.get("window_from_utc"), "window_to_utc": rec.get("window_to_utc"),
        "bars_fetched": rec.get("bars_fetched"), "bars_eligible": rec.get("bars_eligible"),
        "gaps": gaps, "gap_count": len(rec.get("gaps") or []),
        "spanning_count": len(rec.get("spanning_bars") or []),
        "outcome": rec.get("outcome"), "outcome_note": rec.get("outcome_note"),
        "first_touches": first, "touch_counts": counts,
    }

outcomes_records = []
try:
    with open(os.path.join(BASE, "monitoring/outcomes.jsonl"), "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                outcomes_records.append(json.loads(line))
            except Exception:
                continue
except Exception as exc:
    errors["monitoring/outcomes.jsonl"] = type(exc).__name__ + ": " + str(exc)

def latest_run_log(prefix):
    try:
        names = sorted(name for name in os.listdir(os.path.join(BASE, "monitoring", "runs")) if name.startswith(prefix) and name.endswith(".json"))
    except Exception as exc:
        errors["monitoring/runs"] = type(exc).__name__ + ": " + str(exc)
        return None
    if not names:
        return None
    return load_json("monitoring/runs/" + names[-1])

monitor_run = latest_run_log("run-")
settle_run = latest_run_log("settle-")
enroll_run = latest_run_log("enroll-")
settle_state = load_json("monitoring/settle-state.json") or {}

# Scheduled-recovery attestation (doc 57): written ONLY by the one-time
# confirmation check after a scheduled lane run completes monitor +
# settle + enroll cleanly. Absence is a normal pending state, never an
# error, so a missing file records no error entry here.
scheduled_recovery = None
try:
    sr_path = os.path.join(BASE, "monitoring/scheduled-recovery.json")
    if os.path.exists(sr_path):
        with open(sr_path, "r", encoding="utf-8") as fh:
            scheduled_recovery = json.load(fh)
except Exception as exc:
    errors["monitoring/scheduled-recovery.json"] = type(exc).__name__ + ": " + str(exc)

# Canonical-entered file timestamp: enrollment source (fresh pull vs
# last-good-file fallback) is judged against the enroll run time.
canonical_entered_meta = {"modified_utc": None}
try:
    mt = os.path.getmtime(os.path.join(BASE, "monitoring/canonical-entered.json"))
    canonical_entered_meta = {"modified_utc": datetime.datetime.fromtimestamp(mt, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
except Exception as exc:
    errors["monitoring/canonical-entered.json"] = type(exc).__name__ + ": " + str(exc)

snapshot = None
snap_name = md_state.get("last_snapshot")
if snap_name:
    snapshot = load_json("marketdata/snapshots/" + os.path.basename(str(snap_name)))

snap_out = None
if snapshot:
    candles = {}
    for coin, entry in (snapshot.get("candles") or {}).items():
        if isinstance(entry, dict):
            candles[coin] = {"interval": entry.get("interval"), "completed_bars": entry.get("completed_bars")}
    funding_points = {}
    for coin, series in (snapshot.get("funding_history") or {}).items():
        funding_points[coin] = len(series) if isinstance(series, list) else None
    snap_out = {
        "receipt_time_utc": snapshot.get("receipt_time_utc"),
        "venue": snapshot.get("venue"), "market_type": snapshot.get("market_type"),
        "contexts": snapshot.get("contexts") or {},
        "candles": candles, "funding_points": funding_points,
    }

# Engine core snapshot (schema core-snapshot-v1): code-computed book /
# coverage / enrollment health published by the workspace engine. Read
# verbatim for display only; a missing or unparseable file records an
# error entry and yields None so the caller can show "unavailable"
# instead of recomputing anything.
core_snapshot = load_json("snapshots/core-snapshot.json")

out = {
    "positions": positions,
    "core_snapshot": core_snapshot,
    "monitoring_state": mon_state,
    "observations": [summarize_obs(rec) for rec in latest_obs.values()],
    "outcomes": outcomes_records,
    "monitor_run": monitor_run,
    "settle_run": settle_run,
    "enroll_run": enroll_run,
    "scheduled_recovery": scheduled_recovery,
    "canonical_entered_meta": canonical_entered_meta,
    "settle_state": settle_state,
    "market_state": md_state,
    "snapshot": snap_out,
    "errors": errors,
}
print(json.dumps({"ok": True, "status": 200, "data": out, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
`;

function runPaperFiles() {
  const result = spawnSync("python3", ["-c", PYTHON_PAPER_FILES], { encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Paper pilot file read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Paper pilot file read returned an unreadable response." }; }
}

const PYTHON_SCANNER_RUN = String.raw`
import json, os, re

RUNS_DIR = "/home/hatch/workspace/goals/research-terminal/hidden_files/workstreams-2026-10-19/07-worker4-scanner/runs"
PATTERN = re.compile(r"^run-\d{8}T\d{6}Z\.json$")

try:
    files = sorted(name for name in os.listdir(RUNS_DIR) if PATTERN.match(name))
except Exception as exc:
    print(json.dumps({"ok": False, "status": None, "data": None, "creditsCost": None, "creditsRemaining": None, "error": type(exc).__name__ + ": " + str(exc)}, separators=(",", ":")))
    raise SystemExit(0)

if not files:
    print(json.dumps({"ok": True, "status": 200, "data": {"runFile": None, "run": None}, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
    raise SystemExit(0)

latest = files[-1]
try:
    with open(os.path.join(RUNS_DIR, latest), "r", encoding="utf-8") as fh:
        run = json.load(fh)
except Exception as exc:
    print(json.dumps({"ok": False, "status": None, "data": None, "creditsCost": None, "creditsRemaining": None, "error": type(exc).__name__ + ": " + str(exc)}, separators=(",", ":")))
    raise SystemExit(0)

print(json.dumps({"ok": True, "status": 200, "data": {"runFile": latest, "run": run}, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
`;

function runScannerRun() {
  const result = spawnSync("python3", ["-c", PYTHON_SCANNER_RUN], { encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Scanner run read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Scanner run read returned an unreadable response." }; }
}

const PYTHON_ASSET_EVIDENCE = String.raw`
import datetime, json, os, re, sys

payload = json.loads(sys.stdin.read())
symbol = str(payload.get("symbol") or "").strip().upper()
if not re.match(r"^[A-Z0-9][A-Z0-9.=\-]{0,14}$", symbol) or "/" in symbol or "\\" in symbol:
    print(json.dumps({"ok": False, "status": None, "data": None, "creditsCost": None, "creditsRemaining": None, "error": "invalid symbol"}, separators=(",", ":")))
    raise SystemExit(0)

RT = "/home/hatch/workspace/goals/research-terminal"
DOSSIERS = os.path.join(RT, "hidden_files", "asset-dossiers")
CROSS_DIR = os.path.join(RT, "hidden_files", "daily-board", "cross-stream")
CALLS = "/home/hatch/workspace/x-sweep/v2/calls.md"
PASTE = "/home/hatch/workspace/x-sweep/v2/paste-trade-calls.md"
errors = {}

def cap(text, limit=8000):
    if text is None:
        return None
    text = text.strip()
    if len(text) > limit:
        return text[:limit] + "\n... [truncated at " + str(limit) + " chars]"
    return text

# --- asset dossier ---
dossier = {"exists": False, "currentRead": None, "streamLog": None, "learned": None, "updatedAt": None}
dossier_path = os.path.join(DOSSIERS, os.path.basename(symbol) + ".md")
try:
    if os.path.isfile(dossier_path):
        with open(dossier_path, "r", encoding="utf-8") as fh:
            text = fh.read()
        dossier["exists"] = True
        try:
            dossier["updatedAt"] = datetime.datetime.fromtimestamp(os.path.getmtime(dossier_path), datetime.timezone.utc).isoformat()
        except Exception:
            dossier["updatedAt"] = None
        sections = {}
        current = None
        buf = []
        def flush():
            if current is not None:
                sections[current] = "\n".join(buf).strip()
        for line in text.splitlines():
            if line.startswith("## "):
                flush()
                current = line[3:].strip()
                buf = []
            elif current is not None:
                buf.append(line)
        flush()
        for heading, body in sections.items():
            low = heading.lower()
            if "current read" in low:
                dossier["currentRead"] = (heading + " " + body).strip() if body else heading
            elif "stream log" in low:
                dossier["streamLog"] = cap(body)
            elif "what we've learned" in low or "what we’ve learned" in low:
                dossier["learned"] = cap(body)
except Exception as exc:
    errors["dossier"] = type(exc).__name__ + ": " + str(exc)

# --- cross-stream verdict (latest matrix file) ---
cross = {"fileDate": None, "entry": None}
try:
    names = sorted(name for name in os.listdir(CROSS_DIR) if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", name))
    if names:
        latest_name = names[-1]
        with open(os.path.join(CROSS_DIR, latest_name), "r", encoding="utf-8") as fh:
            matrix = json.load(fh)
        cross["fileDate"] = str(matrix.get("date") or latest_name[:-5])
        entry = (matrix.get("assets") or {}).get(symbol)
        if isinstance(entry, dict):
            def str_list(value):
                return [str(item) for item in value] if isinstance(value, list) else []
            cross["entry"] = {
                "board": entry.get("board") if isinstance(entry.get("board"), str) else None,
                "verdict": entry.get("verdict") if isinstance(entry.get("verdict"), str) else None,
                "agree": str_list(entry.get("agree")),
                "disagree": str_list(entry.get("disagree")),
                "risks": str_list(entry.get("risks")),
                "note": entry.get("note") if isinstance(entry.get("note"), str) else None,
            }
except Exception as exc:
    errors["crossStream"] = type(exc).__name__ + ": " + str(exc)

# --- smart-money evidence: whole recorded entries mentioning the symbol ---
token_re = re.compile(r"(?<![A-Za-z0-9$])\$?" + re.escape(symbol) + r"(?![A-Za-z0-9])")
iso_re = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z")
day_re = re.compile(r"^##\s+(\d{4}-\d{2}-\d{2})")
entries = []

def read_lines(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read().splitlines()

try:
    section_date = None
    current = None
    def flush_calls():
        global current
        if current:
            text = "\n".join(current).strip()
            if text and token_re.search(text):
                stamp = iso_re.search(text)
                entries.append({"source": "caller ledger", "date": stamp.group(0) if stamp else section_date, "text": cap(text, 900)})
        current = None
    for line in read_lines(CALLS):
        day = day_re.match(line)
        if day:
            flush_calls()
            section_date = day.group(1)
            continue
        if line.startswith("## ") or line.startswith("# "):
            flush_calls()
            continue
        if line.startswith("- "):
            flush_calls()
            current = [line]
        elif current is not None and (line.startswith(" ") or line.startswith("\t")) and line.strip():
            current.append(line)
        elif not line.strip():
            continue
        else:
            flush_calls()
    flush_calls()
except Exception as exc:
    errors["calls"] = type(exc).__name__ + ": " + str(exc)

try:
    section_date = None
    for line in read_lines(PASTE):
        day = day_re.match(line)
        if day:
            section_date = day.group(1)
            continue
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 6 or cells[0].lower() == "handle" or set(cells[0]) <= set("-: "):
            continue
        if cells[1].upper() != symbol:
            continue
        stamp = iso_re.search(cells[5]) or iso_re.search(stripped)
        entries.append({"source": "paste.trade", "date": stamp.group(0) if stamp else section_date, "text": cap(stripped, 900)})
except Exception as exc:
    errors["paste"] = type(exc).__name__ + ": " + str(exc)

entries.sort(key=lambda item: item.get("date") or "", reverse=True)
entries = entries[:20]

out = {"dossier": dossier, "crossStream": cross, "smartMoney": {"entries": entries}, "errors": errors}
print(json.dumps({"ok": True, "status": 200, "data": out, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
`;

function runAssetEvidence(symbol: string) {
  const result = spawnSync("python3", ["-c", PYTHON_ASSET_EVIDENCE], { input: JSON.stringify({ symbol }), encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Asset evidence file read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Asset evidence file read returned an unreadable response." }; }
}

const PYTHON_FUNDING_SERIES = String.raw`
import json, math, os, re

SERIES_DIR = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/marketdata/series"
series = {}
errors = {}
try:
    names = sorted(os.listdir(SERIES_DIR))
except Exception as exc:
    print(json.dumps({"ok": False, "status": None, "data": None, "creditsCost": None, "creditsRemaining": None, "error": type(exc).__name__ + ": " + str(exc)}, separators=(",", ":")))
    raise SystemExit(0)

for name in names:
    match = re.match(r"^funding-([A-Za-z0-9]+)\.jsonl$", name)
    if not match:
        continue
    sym = match.group(1).upper()
    points = []
    try:
        with open(os.path.join(SERIES_DIR, name), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                try:
                    rec = json.loads(line)
                    value = float(rec.get("value"))
                except Exception:
                    continue
                points.append((str(rec.get("t_utc") or ""), value))
    except Exception as exc:
        errors[sym] = type(exc).__name__ + ": " + str(exc)
        continue
    points = points[-168:]
    if not points:
        continue
    values = [value for _, value in points]
    n = len(values)
    latest = values[-1]
    mean = sum(values) / n
    variance = sum((value - mean) ** 2 for value in values) / n
    sd = math.sqrt(variance)
    z_score = (latest - mean) / sd if sd > 0 else None
    below = sum(1 for value in values if value < latest)
    equal = sum(1 for value in values if value == latest)
    percentile = (below + 0.5 * equal) / n * 100
    series[sym] = {"symbol": sym, "points": n, "firstAt": points[0][0] or None, "latestAt": points[-1][0] or None, "latest": latest, "zScore": z_score, "percentile": percentile}

print(json.dumps({"ok": True, "status": 200, "data": {"series": series, "errors": errors}, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
`;

function runFundingSeries() {
  const result = spawnSync("python3", ["-c", PYTHON_FUNDING_SERIES], { encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Funding series read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Funding series read returned an unreadable response." }; }
}

const PYTHON_HL_POSITIONING = String.raw`
import json, os, re

BASE = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/marketdata"
SNAP_DIR = os.path.join(BASE, "snapshots")
SERIES_DIR = os.path.join(BASE, "series")
COINS = ["BTC", "ETH", "SOL", "NEAR", "HYPE", "SUI"]
errors = {}

def latest_file(pattern):
    try:
        names = sorted(name for name in os.listdir(SNAP_DIR) if re.match(pattern, name))
    except Exception as exc:
        errors["snapshots_dir"] = type(exc).__name__ + ": " + str(exc)
        return None, None
    if not names:
        return None, None
    name = names[-1]
    try:
        with open(os.path.join(SNAP_DIR, name), "r", encoding="utf-8") as fh:
            return name, json.load(fh)
    except Exception as exc:
        errors[name] = type(exc).__name__ + ": " + str(exc)
        return name, None

snapshot_file, snapshot = latest_file(r"^snapshot-.*\.json$")
wallets_file, wallets = latest_file(r"^wallets-.*\.json$")

oi_series = {}
for coin in COINS:
    fname = "oi-" + coin + ".jsonl"
    points = []
    try:
        with open(os.path.join(SERIES_DIR, fname), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                points.append({"t_utc": rec.get("t_utc"), "value": rec.get("value")})
    except Exception as exc:
        errors[fname] = type(exc).__name__ + ": " + str(exc)
    oi_series[coin] = points

out = {
    "snapshotFile": snapshot_file, "snapshot": snapshot,
    "walletsFile": wallets_file, "wallets": wallets,
    "oiSeries": oi_series, "errors": errors,
}
print(json.dumps({"ok": True, "status": 200, "data": out, "creditsCost": None, "creditsRemaining": None, "error": None}, separators=(",", ":")))
`;

function runHlPositioning() {
  const result = spawnSync("python3", ["-c", PYTHON_HL_POSITIONING], { encoding: "utf8", timeout: 60_000, maxBuffer: 16_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "Hyperliquid positioning file read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "Hyperliquid positioning file read returned an unreadable response." }; }
}

const PYTHON_OPENBB_DERIBIT = String.raw`
import json, os

PATH = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/marketdata/openbb/deribit.json"
errors = {}
bundle = None
try:
    with open(PATH, "r", encoding="utf-8") as fh:
        bundle = json.load(fh)
except Exception as exc:
    errors["deribit.json"] = type(exc).__name__ + ": " + str(exc)

out = {"bundle": bundle, "errors": errors}
print(json.dumps({"ok": bundle is not None, "status": 200 if bundle is not None else None, "data": out, "creditsCost": None, "creditsRemaining": None, "error": errors.get("deribit.json")}, separators=(",", ":")))
`;

function runOpenbbDeribit() {
  const result = spawnSync("python3", ["-c", PYTHON_OPENBB_DERIBIT], { encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000 });
  if (result.error) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: (result.stderr || "OpenBB Deribit bundle read failed").slice(0, 500) };
  try { return providerResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, status: null, data: null, creditsCost: null, creditsRemaining: null, error: "OpenBB Deribit bundle read returned an unreadable response." }; }
}

const canonicalWriteResponse = z.object({ ok: z.boolean(), bytes: z.number().nullable(), writtenAtUtc: z.string().nullable(), error: z.string().nullable() });

// The target path is a constant inside this bridge: the caller supplies
// only the serialized file content, never a path, filename, or directory.
// The write is atomic — full content to a temp file in the same directory,
// fsync, then rename over the target — so a failure at any step leaves any
// existing canonical-entered.json untouched and never leaves a partial file.
const PYTHON_WRITE_CANONICAL = String.raw`
import datetime, json, os, sys, tempfile

TARGET = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/monitoring/canonical-entered.json"

def emit(ok, byte_count, written_at, error):
    print(json.dumps({"ok": ok, "bytes": byte_count, "writtenAtUtc": written_at, "error": error}, separators=(",", ":")))

try:
    payload = json.loads(sys.stdin.read())
    content = payload.get("content")
    if not isinstance(content, str) or not content:
        emit(False, None, None, "content must be a non-empty string")
        raise SystemExit(0)
    raw = content.encode("utf-8")
    directory = os.path.dirname(TARGET)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".canonical-entered-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(raw)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_path, TARGET)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    written_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    emit(True, len(raw), written_at, None)
except SystemExit:
    raise
except Exception as exc:
    emit(False, None, None, type(exc).__name__ + ": " + str(exc))
`;

function runWriteCanonical(content: string) {
  const result = spawnSync("python3", ["-c", PYTHON_WRITE_CANONICAL], { input: JSON.stringify({ content }), encoding: "utf8", timeout: 100_000, maxBuffer: 4_000_000 });
  if (result.error) return { ok: false, bytes: null, writtenAtUtc: null, error: result.error.message.slice(0, 500) };
  if (result.status !== 0) return { ok: false, bytes: null, writtenAtUtc: null, error: (result.stderr || "Canonical write subprocess failed").slice(0, 500) };
  try { return canonicalWriteResponse.parse(JSON.parse(result.stdout)); }
  catch { return { ok: false, bytes: null, writtenAtUtc: null, error: "Canonical write returned an unreadable response." }; }
}

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  elfaRequest(args) { return runProvider({ provider: "elfa", ...args }); },
  nansenRequest(args) { return runProvider({ provider: "nansen", ...args }); },
  altfinsRequest(args) { return runProvider({ provider: "altfins", ...args }); },
  memeRiskRequest(args) { return runProvider({ provider: "meme_risk", ...args }); },
  coinstatsRequest(args) { return runProvider({ provider: "coinstats", ...args }); },
  anchainRequest(args) { return runProvider({ provider: "anchain", ...args }); },
  alchemySolanaRequest(args) { return runProvider({ provider: "alchemy_sol", ...args }); },
  alchemyEthRequest(args) { return runProvider({ provider: "alchemy_eth", ...args }); },
  paperPilotFiles() { return runPaperFiles(); },
  hyperliquidScannerRun() { return runScannerRun(); },
  assetEvidenceFiles(args) { return runAssetEvidence(args.symbol); },
  fundingSeriesStats() { return runFundingSeries(); },
  hyperliquidPositioningFiles() { return runHlPositioning(); },
  openbbDeribitFiles() { return runOpenbbDeribit(); },
  writePaperEnrollmentCanonical(args) { return runWriteCanonical(args.content); },
});
