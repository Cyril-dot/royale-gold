/**
 * STUB — the UI agent ports the real v48 Account page here
 * (profile, balances, referral redemption, rewards).
 * Data comes from /api/auth/me, /api/wallet, /api/rewards — see API_CONTRACT.md.
 */
export default function AccountPage() {
  return (
    <main className="min-h-screen bg-midnight px-6 py-10 text-cream">
      <h1 className="font-display text-4xl text-gold">ACCOUNT</h1>
      <p className="mt-3 text-cream/80">Stub — account page (balances, referral code, daily claims) lands here from the v48 port.</p>
    </main>
  );
}
