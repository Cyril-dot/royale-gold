"""Logged-in flow check: owner login, deposit, coin-flip settle, owner/admin pages."""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3101"
OUT = "/home/hatch/workspace/royale-gold/verify"
log = []

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(800)
    log.append("home hdr: " + (page.evaluate("() => document.querySelector('.hdr-right')?.innerText") or ""))
    page.get_by_role("button", name="Log in", exact=True).first.click()
    page.wait_for_timeout(500)
    page.fill("#liContact", "owner@royale.gold")
    page.fill("#liPass", "owner123")
    page.locator('form button[type="submit"]', has_text="Log in").click()
    page.wait_for_timeout(1500)
    log.append("after login hdr: " + (page.evaluate("() => document.querySelector('.hdr-right')?.innerText") or ""))
    page.get_by_role("button", name="Deposit", exact=True).click()
    page.wait_for_timeout(400)
    page.fill("#depAmt", "100")
    page.locator('form button[type="submit"]', has_text="Deposit").click()
    page.wait_for_timeout(1200)
    log.append("after deposit hdr: " + (page.evaluate("() => document.querySelector('.hdr-right')?.innerText") or ""))
    page.goto(BASE + "/games/coin-flip", wait_until="networkidle")
    page.wait_for_timeout(800)
    btns = page.locator("button", has_text="Flip").all()
    log.append(f"flip buttons: {len(btns)}")
    if btns:
        btns[0].click()
    page.wait_for_timeout(1500)
    log.append("toast: " + (page.evaluate("() => document.querySelector('.rg-toasts')?.innerText") or ""))
    log.append("coinflip hdr: " + (page.evaluate("() => document.querySelector('.hdr-right')?.innerText") or ""))
    page.goto(BASE + "/owner", wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/owner-loggedin-1280.png")
    log.append("owner text: " + (page.evaluate("() => document.body.innerText.slice(0, 500)") or ""))
    page.goto(BASE + "/admin", wait_until="networkidle")
    page.wait_for_timeout(1000)
    log.append("admin-as-owner text: " + (page.evaluate("() => document.body.innerText.slice(0, 300)") or ""))
    # penalty room visual check: start shootout
    page.goto(BASE + "/games/penalty-shoot-out", wait_until="networkidle")
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Start shootout").click()
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/penalty-started-1280.png")
    log.append("penalty msg: " + (page.evaluate("() => document.querySelector('.xg-msg')?.innerText") or ""))
    log.append("ERRORS: " + json.dumps(errors[:10]))
    browser.close()

open(f"{OUT}/flow.log", "w").write("\n".join(log))
print("\n".join(log))
