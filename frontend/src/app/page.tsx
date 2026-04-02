import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Heradyne — Risk Infrastructure for Small Business Lending',
  description: 'Heradyne is the risk infrastructure layer for small business lending — turning unfinanceable acquisition deals into insured, structured assets.',
};

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{--ink:#0d1117;--ink-muted:#4a5568;--surface:#f7f6f2;--surface-alt:#edecea;--gold:#b08d4a;--gold-light:#e8d9b5;--gold-dark:#7a5f28;--navy:#0f2340;--navy-mid:#1a3a6b;--border:rgba(15,35,64,0.1);--accent:#c4a55a;}
        html{scroll-behavior:smooth;}
        .hl{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink);overflow-x:hidden;-webkit-font-smoothing:antialiased;}
        .hl-nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 6vw;height:64px;background:rgba(247,246,242,0.95);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);}
        .hl-logo{font-family:'DM Serif Display',serif;font-size:1.2rem;color:var(--navy);letter-spacing:0.06em;text-decoration:none;}
        .hl-nav-links{display:flex;align-items:center;gap:0.75rem;}
        .hl-nav-link{color:var(--ink-muted);font-size:0.82rem;font-weight:500;text-decoration:none;letter-spacing:0.03em;padding:6px 12px;border-radius:3px;transition:color 0.2s;}
        .hl-nav-link:hover{color:var(--navy);}
        .hl-nav-cta{background:var(--navy);color:#fff;font-size:0.8rem;font-weight:500;padding:9px 22px;border-radius:3px;text-decoration:none;letter-spacing:0.05em;transition:background 0.2s;}
        .hl-nav-cta:hover{background:var(--navy-mid);}
        .hl-hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 6vw 4rem;text-align:center;}
        .hl-eyebrow{display:inline-block;font-size:0.68rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-light);padding:4px 12px;border-radius:2px;margin-bottom:1.75rem;}
        .hl-h1{font-family:'DM Serif Display',serif;font-size:clamp(3.2rem,6vw,5.5rem);line-height:1.06;color:var(--navy);margin-bottom:1.6rem;max-width:900px;}
        .hl-h1 em{font-style:italic;color:var(--gold-dark);}
        .hl-sub{font-size:1.1rem;line-height:1.8;color:var(--ink-muted);max-width:680px;margin:0 auto 3rem;font-weight:300;}
        .hl-cta-split{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;max-width:700px;width:100%;margin:0 auto 2.5rem;}
        .hl-card{background:#fff;border:1.5px solid var(--border);border-radius:6px;padding:2rem 1.75rem;text-decoration:none;transition:border-color 0.2s,box-shadow 0.2s,transform 0.15s;text-align:left;display:block;}
        .hl-card:hover{border-color:var(--navy);box-shadow:0 4px 20px rgba(15,35,64,0.1);transform:translateY(-2px);}
        .hl-card-tag{font-size:0.65rem;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold);margin-bottom:0.7rem;}
        .hl-card-title{font-family:'DM Serif Display',serif;font-size:1.35rem;color:var(--navy);margin-bottom:0.6rem;line-height:1.2;}
        .hl-card-body{font-size:0.82rem;color:var(--ink-muted);line-height:1.7;font-weight:300;margin-bottom:1.25rem;}
        .hl-card-action{font-size:0.8rem;font-weight:500;color:var(--navy);letter-spacing:0.04em;}
        .hl-card-action::after{content:' →';}
        .hl-card.primary{background:var(--navy);border-color:var(--navy);}
        .hl-card.primary .hl-card-tag{color:var(--accent);}
        .hl-card.primary .hl-card-title{color:#fff;}
        .hl-card.primary .hl-card-body{color:rgba(255,255,255,0.55);}
        .hl-card.primary .hl-card-action{color:var(--accent);}
        .hl-card.primary:hover{background:var(--navy-mid);border-color:var(--navy-mid);}
        .hl-signin{font-size:0.8rem;color:var(--ink-muted);}
        .hl-signin a{color:var(--navy);text-decoration:underline;text-underline-offset:3px;}
        .hl-stats{display:grid;grid-template-columns:repeat(3,1fr);background:#fff;border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
        .hl-stat{padding:2.5rem 3vw;text-align:center;border-right:1px solid var(--border);}
        .hl-stat:last-child{border-right:none;}
        .hl-stat-num{font-family:'DM Serif Display',serif;font-size:2.8rem;color:var(--navy);line-height:1;margin-bottom:0.5rem;}
        .hl-stat-desc{font-size:0.8rem;color:var(--ink-muted);line-height:1.6;font-weight:300;}
        .hl-problem{background:var(--navy);padding:8rem 6vw;}
        .hl-solution{padding:8rem 6vw;background:var(--surface);}
        .hl-sec-hdr{text-align:center;max-width:960px;margin:0 auto 5rem;}
        .hl-sec-hdr h2{font-family:'DM Serif Display',serif;font-size:clamp(2.4rem,5vw,4.2rem);line-height:1.08;margin-bottom:1.25rem;}
        .hl-sec-hdr.lt h2{color:#fff;} .hl-sec-hdr.lt h2 em{font-style:italic;color:var(--accent);}
        .hl-sec-hdr.lt p{font-size:1.05rem;line-height:1.8;color:rgba(255,255,255,0.5);font-weight:300;max-width:640px;margin:0 auto;}
        .hl-sec-hdr.dk h2{color:var(--navy);} .hl-sec-hdr.dk h2 em{font-style:italic;color:var(--gold-dark);}
        .hl-sec-hdr.dk p{font-size:1.05rem;line-height:1.8;color:var(--ink-muted);font-weight:300;max-width:640px;margin:0 auto;}
        .hl-pgrid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(255,255,255,0.07);border-radius:6px;overflow:hidden;max-width:960px;margin:0 auto;}
        .hl-pcell{padding:2.75rem 2.25rem;border-right:1px solid rgba(255,255,255,0.07);text-align:center;transition:background 0.2s;}
        .hl-pcell:last-child{border-right:none;}
        .hl-pcell:hover{background:rgba(255,255,255,0.03);}
        .hl-pnum{font-family:'DM Serif Display',serif;font-size:2.8rem;color:var(--accent);line-height:1;margin-bottom:0.8rem;}
        .hl-ptitle{font-size:0.9rem;font-weight:500;color:#fff;margin-bottom:0.75rem;line-height:1.4;}
        .hl-pbody{font-size:0.82rem;color:rgba(255,255,255,0.4);line-height:1.7;font-weight:300;}
        .hl-steps{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--border);border-radius:6px;overflow:hidden;max-width:960px;margin:0 auto;}
        .hl-step{padding:2.5rem 2rem;border-right:1px solid var(--border);background:#fff;transition:background 0.2s;}
        .hl-step:last-child{border-right:none;}
        .hl-step:hover{background:var(--surface-alt);}
        .hl-snum{font-family:'DM Serif Display',serif;font-size:1.8rem;color:var(--gold);line-height:1;margin-bottom:1.25rem;opacity:0.65;}
        .hl-stitle{font-size:0.95rem;font-weight:500;color:var(--navy);margin-bottom:0.7rem;}
        .hl-sbody{font-size:0.82rem;color:var(--ink-muted);line-height:1.75;font-weight:300;}
        .hl-bcta{background:var(--navy);padding:6rem 6vw;text-align:center;}
        .hl-bcta h2{font-family:'DM Serif Display',serif;font-size:clamp(2rem,4vw,3.2rem);color:#fff;margin-bottom:1rem;line-height:1.1;}
        .hl-bcta h2 em{font-style:italic;color:var(--accent);}
        .hl-bcta p{font-size:1rem;color:rgba(255,255,255,0.5);font-weight:300;max-width:560px;margin:0 auto 2.5rem;line-height:1.8;}
        .hl-bactions{display:flex;gap:0.875rem;flex-wrap:wrap;justify-content:center;}
        .hl-btn-lt{background:#fff;color:var(--navy);padding:11px 28px;border-radius:3px;font-size:0.83rem;font-weight:500;text-decoration:none;letter-spacing:0.04em;transition:background 0.2s,transform 0.15s;}
        .hl-btn-lt:hover{background:var(--gold-light);transform:translateY(-1px);}
        .hl-btn-gh{color:rgba(255,255,255,0.7);border:1.5px solid rgba(255,255,255,0.25);padding:10px 26px;border-radius:3px;font-size:0.83rem;font-weight:500;text-decoration:none;letter-spacing:0.04em;transition:all 0.2s;}
        .hl-btn-gh:hover{border-color:rgba(255,255,255,0.6);color:#fff;}
        .hl-footer{background:#080f1a;padding:2.25rem 6vw;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;}
        .hl-flogo{font-family:'DM Serif Display',serif;font-size:1rem;color:rgba(255,255,255,0.55);text-decoration:none;letter-spacing:0.06em;}
        .hl-fcopy{font-size:0.72rem;color:rgba(255,255,255,0.22);letter-spacing:0.02em;}
        .hl-flink{font-size:0.72rem;color:rgba(255,255,255,0.3);text-decoration:none;transition:color 0.2s;}
        .hl-flink:hover{color:rgba(255,255,255,0.65);}
        @media(max-width:960px){
          .hl-cta-split{grid-template-columns:1fr;max-width:420px;}
          .hl-stats{grid-template-columns:1fr;}
          .hl-stat{border-right:none;border-bottom:1px solid var(--border);}
          .hl-stat:last-child{border-bottom:none;}
          .hl-pgrid{grid-template-columns:1fr;}
          .hl-pcell{border-right:none;border-bottom:1px solid rgba(255,255,255,0.07);}
          .hl-pcell:last-child{border-bottom:none;}
          .hl-steps{grid-template-columns:1fr 1fr;}
          .hl-step{border-right:none;border-bottom:1px solid var(--border);}
          .hl-step:nth-child(odd){border-right:1px solid var(--border);}
          .hl-step:nth-last-child(-n+2){border-bottom:none;}
          .hl-nav-links .hl-nav-link{display:none;}
        }
        @media(max-width:560px){
          .hl-steps{grid-template-columns:1fr;}
          .hl-step{border-right:none !important;}
          .hl-step:last-child{border-bottom:none;}
        }
      `}</style>

      <div className="hl">
        {/* NAV */}
        <nav className="hl-nav">
          <a className="hl-logo" href="#">HERADYNE</a>
          <div className="hl-nav-links">
            <a className="hl-nav-link" href="#problem">The Problem</a>
            <a className="hl-nav-link" href="#solution">How It Works</a>
            <Link className="hl-nav-link" href="/login">Sign In</Link>
            <Link className="hl-nav-cta" href="/register">Create Account</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="hl-hero">
          <span className="hl-eyebrow">Risk Infrastructure · SMB Acquisitions</span>
          <h1 className="hl-h1">Unlocking the<br /><em>Next Trillion</em><br />in Main Street Transactions</h1>
          <p className="hl-sub">Heradyne is the risk infrastructure layer for small business lending — turning unfinanceable acquisition deals into insured, structured assets that lenders, insurers, and capital markets can confidently deploy.</p>

          <div className="hl-cta-split">
            <Link className="hl-card primary" href="/pre-deal">
              <div className="hl-card-tag">For Buyers &amp; Sellers</div>
              <div className="hl-card-title">Validate Your Business</div>
              <div className="hl-card-body">Get an institutional-grade valuation and full diligence package powered by SBA-calibrated AI — in minutes, not weeks.</div>
              <div className="hl-card-action">Get my valuation</div>
            </Link>
            <Link className="hl-card" href="/register">
              <div className="hl-card-tag">For Lenders &amp; Insurers</div>
              <div className="hl-card-title">Create an Account</div>
              <div className="hl-card-body">Access deal flow, AI risk scores, and structured diligence packages across the SMB acquisition market.</div>
              <div className="hl-card-action">Sign up free</div>
            </Link>
          </div>

          <p className="hl-signin">Already have an account? <Link href="/login">Sign in →</Link></p>
        </section>

        {/* STATS */}
        <div className="hl-stats">
          <div className="hl-stat">
            <div className="hl-stat-num">~1M</div>
            <div className="hl-stat-desc">Businesses coming to market annually as Baby Boomers retire</div>
          </div>
          <div className="hl-stat">
            <div className="hl-stat-num">94%</div>
            <div className="hl-stat-desc">Of deals go unfunded — only 50–70K SBA loans close each year</div>
          </div>
          <div className="hl-stat">
            <div className="hl-stat-num">$10T</div>
            <div className="hl-stat-desc">In value locked by unmanaged, unpriced acquisition risk</div>
          </div>
        </div>

        {/* PROBLEM */}
        <section className="hl-problem" id="problem">
          <div className="hl-sec-hdr lt">
            <h2>This Is Not a Capital Problem.<br />It&apos;s a <em>Risk Problem.</em></h2>
            <p>Lenders face a binary choice: approve and absorb concentrated risk, or deny and lose the deal entirely. With no infrastructure to price and distribute that risk, hundreds of thousands of deals simply don&apos;t happen.</p>
          </div>
          <div className="hl-pgrid">
            <div className="hl-pcell">
              <div className="hl-pnum">~1M</div>
              <div className="hl-ptitle">Businesses coming to market annually</div>
              <div className="hl-pbody">Baby Boomers retiring at 10,000+ per day. 55% of small business owners are already over 55. The pipeline is enormous and accelerating.</div>
            </div>
            <div className="hl-pcell">
              <div className="hl-pnum">94%</div>
              <div className="hl-ptitle">Of deals go unfunded by the SBA</div>
              <div className="hl-pbody">Only 50,000–70,000 SBA loans are completed each year against ~800,000 buyers who need financing. Conventional lending doesn&apos;t fill the gap.</div>
            </div>
            <div className="hl-pcell">
              <div className="hl-pnum">$10T</div>
              <div className="hl-ptitle">In value stays locked</div>
              <div className="hl-pbody">Buyers can&apos;t acquire. Sellers can&apos;t exit. Lenders can&apos;t lend. Insurers can&apos;t participate. The entire ecosystem is frozen by unmanaged, unpriced risk.</div>
            </div>
          </div>
        </section>

        {/* SOLUTION */}
        <section className="hl-solution" id="solution">
          <div className="hl-sec-hdr dk">
            <h2>We Make<br /><em>Unfinanceable Deals</em><br />Financeable.</h2>
            <p>Heradyne is the risk infrastructure layer for SMB acquisition lending. We analyze, price, structure, and route each deal — converting loans into insured, financeable assets.</p>
          </div>
          <div className="hl-steps">
            <div className="hl-step">
              <div className="hl-snum">01</div>
              <div className="hl-stitle">Analyze</div>
              <div className="hl-sbody">Default risk assessment for every deal, powered by 1.5M+ SBA 7(a) loans and 25 years of performance data. Probability of Default, Loss Given Default, and Expected Loss — calculated per transaction in real time.</div>
            </div>
            <div className="hl-step">
              <div className="hl-snum">02</div>
              <div className="hl-stitle">Price</div>
              <div className="hl-sbody">Dynamically priced risk per transaction. Not static tables — actuarial modeling that accounts for industry, geography, deal structure, and stress scenarios.</div>
            </div>
            <div className="hl-step">
              <div className="hl-snum">03</div>
              <div className="hl-stitle">Structure</div>
              <div className="hl-sbody">Guarantees and coverage designed per deal. Flexible coverage from 50–100% of loan exposure. Patent-pending protection framework built for consistent underwriting profit at scale.</div>
            </div>
            <div className="hl-step">
              <div className="hl-snum">04</div>
              <div className="hl-stitle">Route</div>
              <div className="hl-sbody">Match each deal to its best capital source. Multi-source routing connects lenders, insurers, and institutional investors — none of whom currently operate in this gap.</div>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="hl-bcta">
          <h2>Ready to get started?<br /><em>Your first valuation takes minutes.</em></h2>
          <p>Whether you&apos;re buying a business, lending on one, or insuring the risk — Heradyne gives you the institutional-grade analysis to act with confidence.</p>
          <div className="hl-bactions">
            <Link className="hl-btn-lt" href="/pre-deal">Validate My Business</Link>
            <Link className="hl-btn-gh" href="/register">Create an Account</Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="hl-footer">
          <a className="hl-flogo" href="#">HERADYNE</a>
          <p className="hl-fcopy">Confidential — Not for Distribution &nbsp;·&nbsp; © 2025 Heradyne</p>
          <a className="hl-flink" href="mailto:Tate.Beasley@Heradyne.com">Tate.Beasley@Heradyne.com</a>
        </footer>
      </div>
    </>
  );
}
