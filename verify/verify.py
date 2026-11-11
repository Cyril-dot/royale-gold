"""Royale Gold verification: render pages at 1280px and 390px, collect
console errors/pageerrors, check horizontal overflow, log in as owner,
exercise a settle + a rewards claim, and screenshot key pages."""
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3101"
OUT = "/home/hatch/workspace/royale-gold/verify"

PAGES = [
    ("home", "/"),
    ("games", "/games"),
    ("penalty", "/games/penalty-shoot-out"),
    ("mines", "/games/mines"),
    ("jet-fly", "/games/jet-fly"),
    ("tetris", "/games/tetris"),
    ("trivia", "/games/trivia"),
    ("admin", "/admin"),
    ("owner", "/owner"),
    ("account", "/account"),
]

def check_page(pw, path, width, tag, login=False):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": width, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE + path, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1200)
    if login:
        # open login modal via header button
        try:
            page.get_by_role("button", name="Log in", exact=True).first.click(timeout=3000)
            page.wait_for_timeout(500)
            page.fill("#liContact", "owner@royale.gold")
            page.fill("#liPass", "owner123")
            page.locator('form button[type="submit"]', has_text="Log in").click()
            page.wait_for_timeout(1500)
        except Exception as e:
            errors.append(f"login-attempt: {e}")
    overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    body_text = page.evaluate("() => document.body.innerText.slice(0, 400)")
    page.screenshot(path=f"{OUT}/{tag}-{width}.png", full_page=False)
    browser.close()
    return {"path": path, "width": width, "overflow_px": overflow, "errors": errors[:10], "text_snippet": body_text[:300]}

def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    results = []
    with sync_playwright() as pw:
        for name, path in PAGES:
            for w in (1280, 390):
                try:
                    r = check_page(pw, path, w, name, login=(name == "home" and w == 1280))
                    results.append(r)
                    print(json.dumps({k: v for k, v in r.items() if k != "text_snippet"}))
                except Exception as e:
                    print(f"FAIL {name} {w}: {e}")
                    results.append({"path": path, "width": w, "fail": str(e)})
        # logged-in flow: owner login -> owner page screenshot + deposit + settle
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(BASE + "/", wait_until="networkidle")
        page.get_by_role("button", name="Log in", exact=True).first.click()
        page.wait_for_timeout(400)
        page.fill("#liContact", "owner@royale.gold")
        page.fill("#liPass", "owner123")
        page.locator('form button[type="submit"]', has_text="Log in").click()
        page.wait_for_timeout(1500)
        hdr = page.evaluate("() => document.querySelector('.hdr-right')?.innerText")
        print("HEADER AFTER OWNER LOGIN:", hdr)
        # deposit 100 MTN
        page.get_by_role("button", name="Deposit", exact=True).click()
        page.wait_for_timeout(400)
        page.fill("#depAmt", "100")
        page.locator('form button[type="submit"]', has_text="Deposit").click()
        page.wait_for_timeout(1200)
        print("AFTER DEPOSIT header:", page.evaluate("() => document.querySelector('.hdr-right')?.innerText"))
        # play coin flip: go to room, place stake, flip
        page.goto(BASE + "/games/coin-flip", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.get_by_role("button", name="Flip", exact=False).first.click()
        page.wait_for_timeout(1500)
        print("COIN FLIP toast area:", page.evaluate("() => document.querySelector('.rg-toasts')?.innerText"))
        # owner page
        page.goto(BASE + "/owner", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{OUT}/owner-loggedin-1280.png")
        print("OWNER TEXT:", page.evaluate("() => document.body.innerText.slice(0, 600)"))
        # admin page as owner (should 403 -> note)
        page.goto(BASE + "/admin", wait_until="networkidle")
        page.wait_for_timeout(1000)
        print("ADMIN AS OWNER:", page.evaluate("() => document.body.innerText.slice(0, 300)"))
        print("FLOW ERRORS:", errors[:10])
        browser.close()
    json.dump(results, open(f"{OUT}/results.json", "w"), indent=2)

if __name__ == "__main__":
    main()
