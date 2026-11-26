import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="legal">
      <a routerLink="/" class="back">Back to EquityLens</a>
      <h1>Privacy policy</h1>
      <p class="updated">Last updated: 29 March 2026</p>

      <section>
        <h2>Overview</h2>
        <p>EquityLens ("we", "us", "our") is an ASX stock analysis platform built as an open-source portfolio project. We respect your privacy and are committed to protecting any personal data you share with us.</p>
      </section>

      <section>
        <h2>Data we collect</h2>
        <p>When you sign in with Google or GitHub, we receive and store:</p>
        <ul>
          <li><strong>Name</strong>: your display name from your OAuth provider</li>
          <li><strong>Email address</strong>: used to identify your account</li>
          <li><strong>Profile picture URL</strong>: displayed in the sidebar</li>
          <li><strong>OAuth provider</strong>: whether you signed in with Google or GitHub</li>
        </ul>
        <p>We do <strong>not</strong> collect passwords, payment information, browsing history, or any data beyond what is listed above.</p>
      </section>

      <section>
        <h2>How we use your data</h2>
        <ul>
          <li><strong>Authentication</strong>: to sign you in and maintain your session</li>
          <li><strong>Watchlist</strong>: to save your personalised stock watchlist</li>
          <li><strong>Display</strong>: to show your name and avatar in the app</li>
        </ul>
        <p>We do not sell, share, or transfer your personal data to any third parties. We do not use your data for advertising, analytics, or marketing purposes.</p>
      </section>

      <section>
        <h2>Data storage</h2>
        <p>Your data is stored in a PostgreSQL database hosted on <a href="https://neon.tech" target="_blank" rel="noopener">Neon</a> (US East). Authentication sessions use JSON Web Tokens (JWT) stored in your browser's local storage.</p>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>Your account data is retained for as long as you have an account. You may request deletion of your data at any time by contacting us.</p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>We use a single temporary cookie (<code>oauth_state</code>) during the sign-in process for security (CSRF protection). It expires after 5 minutes and is not used for tracking.</p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <ul>
          <li><strong>Google OAuth</strong>: for sign-in (<a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>)</li>
          <li><strong>GitHub OAuth</strong>: for sign-in (<a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">GitHub Privacy Statement</a>)</li>
          <li><strong>Neon</strong>: database hosting</li>
          <li><strong>Render</strong>: backend hosting</li>
          <li><strong>Vercel</strong>: frontend hosting</li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Request a copy of your stored data</li>
          <li>Request deletion of your account and data</li>
          <li>Revoke OAuth access from your Google or GitHub account settings at any time</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>For privacy-related requests, contact us at <a href="mailto:adstar3108@gmail.com">adstar3108&#64;gmail.com</a>.</p>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .legal {
      max-width: 680px;
      margin: 0 auto;
      padding: 32px 32px 80px;
      color: var(--text-primary);
      line-height: 1.7;
    }
    .back {
      display: inline-flex;
      align-items: center;
      height: 32px;
      margin: 0 0 16px -8px;
      padding: 0 8px;
      border-radius: var(--radius);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 13px;
      transition: color var(--dur-fast) var(--ease), background-color var(--dur-fast) var(--ease);
      &:hover { color: var(--text-primary); background: var(--bg-hover); }
    }
    h1 {
      font-family: 'Archivo', sans-serif;
      font-stretch: 104%;
      font-size: 32px;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 0 0 8px;
    }
    .updated {
      color: var(--text-muted);
      font-size: 13px;
      margin: 0 0 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    h2 {
      font-size: 16px;
      font-weight: 500;
      margin: 32px 0 8px;
      color: var(--text-primary);
    }
    p, li {
      color: var(--text-secondary);
      font-size: 15px;
    }
    p { margin: 0 0 12px; }
    ul {
      list-style: disc;
      padding-left: 20px;
      margin: 8px 0;
    }
    li { margin: 4px 0; }
    li::marker { color: var(--text-muted); }
    strong { color: var(--text-primary); font-weight: 500; }
    a { color: var(--accent-ink); text-underline-offset: 3px; }
    code {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }
    @media (max-width: 768px) {
      .legal { padding: 24px 16px 64px; }
      h1 { font-size: 26px; }
    }
  `],
})
export class PrivacyComponent {}
