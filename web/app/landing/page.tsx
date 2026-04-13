"use client";

import { useState, useEffect } from "react";
import Logo from "@/components/Logo";

// Formspree endpoint — replace with actual ID when confirmed
const FORMSPREE_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";

function RequestAccessButton({ className }: { className?: string }) {
  return (
    <a
      href="#request-access"
      className={`inline-block bg-[#2A7A72] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#235f59] transition-colors ${className ?? ""}`}
    >
      Request access
    </a>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    return () => {
      html.style.overflow = "";
      html.style.height = "";
      body.style.overflow = "";
      body.style.height = "";
    };
  }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="bg-white text-[#111111] font-[family-name:var(--font-poppins)]">

      {/* ── 1. Nav ─────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size={28} />
          <RequestAccessButton />
        </div>
      </nav>

      {/* ── 2. Hero ────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pt-44 pb-28 text-center">
        <h1 className="text-5xl sm:text-6xl font-semibold leading-tight tracking-tight mb-8">
          The room of experts you&rsquo;ve never had access to.
        </h1>
        <p className="text-xl text-[#666666] max-w-2xl mx-auto leading-relaxed mb-10">
          Most professionals face complex problems alone. Roundtable puts a room of specialists around every question you bring.
        </p>
        <RequestAccessButton className="text-base px-8 py-4" />
        <p className="text-sm text-[#666666] mt-6">
          No prompt engineering. No generic answers. Built-in expertise, ready when you are.
        </p>
      </section>

      {/* ── 3. The problem ─────────────────────────────────────────── */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#2A7A72] mb-12 text-center">
            The problem with going it alone
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              {
                title: "One perspective",
                body: "Most advice comes from one source. One model, one consultant, one colleague. Complex problems need more than that.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="#2A7A72" strokeWidth="2" />
                    <path d="M16 10v7" stroke="#2A7A72" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="16" cy="22" r="1.5" fill="#2A7A72" />
                  </svg>
                ),
              },
              {
                title: "No specialist depth",
                body: "Generic knowledge delivered confidently isn't the same as specialist expertise. The difference matters when the stakes are high.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="6" y="20" width="4" height="6" rx="1" fill="#2A7A72" />
                    <rect x="14" y="14" width="4" height="12" rx="1" fill="#2A7A72" opacity="0.4" />
                    <rect x="22" y="8" width="4" height="18" rx="1" fill="#2A7A72" opacity="0.2" />
                  </svg>
                ),
              },
              {
                title: "No one to challenge you",
                body: "The most valuable thing a room of experts does isn't answer your question — it's tell you when you're asking the wrong one.",
                icon: (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="12" r="5" stroke="#2A7A72" strokeWidth="2" />
                    <path d="M6 26c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#2A7A72" strokeWidth="2" strokeLinecap="round" />
                    <path d="M24 10l4-4M24 6l4 4" stroke="#2A7A72" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ),
              },
            ].map(({ title, body, icon }) => (
              <div key={title} className="flex flex-col gap-4">
                <div>{icon}</div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-[#666666] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. How it works ────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#2A7A72] mb-12 text-center">
            How Roundtable works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              {
                step: "1",
                title: "You ask",
                body: "Bring your question to the right room. No special phrasing needed — just ask it the way you'd put it to a senior colleague.",
              },
              {
                step: "2",
                title: "The room responds",
                body: "Your question goes to a room of specialists. Each brings their own expertise and perspective, independently, before the picture is drawn together.",
              },
              {
                step: "3",
                title: "You get a complete picture",
                body: "A structured response that brings together specialist perspectives — giving you the depth and breadth you'd only get from a room of senior experts.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex flex-col items-center text-center gap-4">
                <span className="text-4xl font-semibold text-[#2A7A72] leading-none">{step}</span>
                <div className="w-8 h-px bg-[#2A7A72]" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-[#666666] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Two modes ───────────────────────────────────────────── */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#2A7A72] mb-12 text-center">
            Two modes
          </h2>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h3 className="text-2xl font-semibold mb-1">Consult</h3>
              <p className="text-sm text-[#2A7A72] font-medium mb-3">Depth on demand</p>
              <p className="text-[#666666] leading-relaxed">
                Bring a question to a specialist room. Get a structured, multi-perspective response that gives you the breadth and depth to make a better decision.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h3 className="text-2xl font-semibold mb-1">Debate</h3>
              <p className="text-sm text-[#2A7A72] font-medium mb-3">Put it to the room</p>
              <p className="text-[#666666] leading-relaxed">
                Set a proposition, let the specialists interrogate it, and get a reasoned conclusion — plus the gaps and caveats you need to know about.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Pillars ─────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#2A7A72] mb-12 text-center">
            The rooms
          </h2>
          <div className="flex flex-col gap-12">
            {[
              {
                title: "Infrastructure & Engineering",
                body: "Technical architecture, systems thinking, and engineering delivery.",
                rooms: [
                  { name: "Construction & Project Delivery", desc: "Project controls, commercial management, design, safety, and contracts across the built environment." },
                  { name: "Energy & Power Systems", desc: "Generation, transmission, renewables, regulation, and project finance across the global energy sector." },
                  { name: "Railway Engineering", desc: "Railway infrastructure projects, systems, and delivery." },
                  { name: "Water & Utilities", desc: "Water, wastewater, drainage, and utility infrastructure design, delivery, and asset management." },
                ],
              },
              {
                title: "Strategy & Advisory",
                body: "Commercial strategy, decision support, and executive counsel.",
                rooms: [
                  { name: "Business Strategy & Growth", desc: "Competitive strategy, market positioning, financial performance, and growth planning." },
                  { name: "Lean Manufacturing", desc: "Lean principles, continuous improvement, and operational performance for any industry." },
                  { name: "Supply Chain & Logistics", desc: "Supply chain design, procurement, logistics, resilience, and sustainability." },
                  { name: "Sustainability & ESG", desc: "ESG strategy, carbon and climate, sustainability reporting, and sustainable finance." },
                ],
              },
              {
                title: "People & Organisation",
                body: "Talent, culture, leadership, and organisational design.",
                rooms: [
                  { name: "Change Management & Transformation", desc: "Change strategy, communications, stakeholder engagement, and programme leadership for complex transformations." },
                  { name: "HR Strategy & Workforce Planning", desc: "People strategy, workforce planning, talent management, compensation, and HR transformation." },
                  { name: "Learning & Development", desc: "L&D strategy, skills development, leadership capability, and building a learning culture." },
                  { name: "Organisational Design", desc: "Organisational structure, operating models, culture, and process design." },
                ],
              },
              {
                title: "Digital & Technology",
                body: "Product, data, platforms, and technology transformation.",
                rooms: [
                  { name: "Cybersecurity", desc: "Security strategy, threat intelligence, architecture, compliance, and incident response." },
                  { name: "Data, Analytics & AI", desc: "Data strategy, engineering, analytics, AI deployment, governance, and responsible use." },
                  { name: "Digital Transformation", desc: "Digital strategy, technology adoption, process transformation, and making digital investment deliver value." },
                  { name: "IT Strategy & Architecture", desc: "IT strategy, enterprise architecture, cloud, vendor management, and technology leadership." },
                ],
              },
            ].map(({ title, body, rooms }) => (
              <div key={title}>
                <div className="mb-6">
                  <h3 className="text-2xl font-semibold">{title}</h3>
                  <p className="text-sm text-[#666666] mt-1">{body}</p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {rooms.map(({ name, desc }) => (
                    <div key={name} className="p-4 rounded-lg border border-gray-200 hover:border-[#2A7A72] transition-colors">
                      <p className="text-sm font-semibold mb-1">{name}</p>
                      <p className="text-xs text-[#666666] leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Differentiator ──────────────────────────────────────── */}
      <section className="bg-gray-50 py-28">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <blockquote className="text-3xl sm:text-4xl font-semibold leading-snug mb-16">
            &ldquo;Advice that sounds right and advice that is right are not the same thing.&rdquo;
          </blockquote>
          <div className="grid sm:grid-cols-2 gap-8 text-left">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h3 className="font-semibold text-lg mb-3">ChatGPT</h3>
              <p className="text-[#666666]">One model. One answer. One perspective.</p>
            </div>
            <div className="bg-white rounded-xl border border-[#2A7A72] p-8">
              <div className="mb-3">
                <Logo size={22} />
              </div>
              <p className="text-[#666666]">A room of specialists. Independent perspectives. Depth you can act on.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Request access ──────────────────────────────────────── */}
      <section id="request-access" className="py-28">
        <div className="max-w-md mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold mb-3">Request access</h2>
          <p className="text-[#666666] mb-10">Join the waitlist and we&rsquo;ll be in touch.</p>

          {submitted ? (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-8">
              <p className="font-semibold text-lg mb-2">You&rsquo;re on the list.</p>
              <p className="text-[#666666]">We&rsquo;ll be in touch once your account is ready.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1.5">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#2A7A72] focus:border-transparent transition"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#2A7A72] focus:border-transparent transition"
                  placeholder="jane@company.com"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                className="w-full bg-[#2A7A72] text-white font-semibold py-3 rounded-lg hover:bg-[#235f59] transition-colors mt-2"
              >
                Request access
              </button>
            </form>
          )}

          <p className="text-sm text-[#666666] mt-6 leading-relaxed">
            Roundtable is currently in private testing. We&rsquo;ll be in touch once your account is ready.
          </p>
        </div>
      </section>

      {/* ── 9. Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <Logo size={22} />
            <p className="text-sm text-[#666666]">
              The best thinking has always come from a room, not a person.
            </p>
          </div>
          <p className="text-sm text-[#666666] shrink-0">&copy; 2026 Roundtable</p>
        </div>
      </footer>

    </div>
  );
}
