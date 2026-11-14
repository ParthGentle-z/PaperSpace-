import React, { useState } from "react";
import { UserRound, X, Mail, LockKeyhole, Chrome, LogOut, LoaderCircle } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";

const friendlyError = error => {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before completion.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
    "auth/unauthorized-domain": "This website domain is not authorised in Firebase Authentication.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again."
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
};

export default function AccountControl() {
  const { user, loading, configured, signIn, register, signInWithGoogle, resetPassword, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const close = () => { setOpen(false); setError(""); setMessage(""); setPassword(""); };
  const run = async action => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); if (mode !== "reset") close(); }
    catch (err) { setError(friendlyError(err)); }
    finally { setBusy(false); }
  };
  const changeMode = next => { setMode(next); setError(""); setMessage(""); setPassword(""); };

  return <>
    <button className="account-trigger" onClick={() => setOpen(true)} title={user ? "Account settings" : "Sign in to PaperSpace"} aria-label={user ? "Account settings" : "Sign in"}>
      <UserRound size={16}/>
      <span>{loading ? "Account…" : user ? (user.displayName || user.email || "Account") : "Sign in"}</span>
    </button>
    {open && <div className="account-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="account-close" onClick={close} aria-label="Close account dialog"><X size={18}/></button>
        {user ? <>
          <div className="account-avatar"><UserRound size={23}/></div>
          <p className="account-eyebrow">PAPERSPACE ACCOUNT</p>
          <h2 id="account-title">You’re signed in</h2>
          <p className="account-subtitle">{user.displayName || user.email}</p>
          <div className="account-notice">Your papers and annotations remain stored locally in this milestone. Cloud sync will be introduced separately.</div>
          <button className="button button-secondary button-full" disabled={busy} onClick={() => run(signOut)}><LogOut size={16}/>Sign out</button>
        </> : <>
          <div className="account-avatar"><UserRound size={23}/></div>
          <p className="account-eyebrow">PAPERSPACE ACCOUNT</p>
          <h2 id="account-title">{mode === "register" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back"}</h2>
          <p className="account-subtitle">{mode === "register" ? "Create an account to prepare for secure research sync." : mode === "reset" ? "We’ll email you a password reset link." : "Sign in to your research workspace."}</p>
          {!configured && <div className="account-notice">Authentication is not connected yet. The app remains in local-only mode. Firebase project setup is a separate step and has not been performed.</div>}
          {configured && <button className="button button-secondary button-full google-signin" disabled={busy} onClick={() => run(signInWithGoogle)}><Chrome size={17}/>Continue with Google</button>}
          {configured && <div className="account-divider"><span>or use email</span></div>}
          {mode === "register" && <label className="account-field"><span>Name</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Your name" autoComplete="name"/></label>}
          <label className="account-field"><span>Email address</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email"/></label>
          {mode !== "reset" && <label className="account-field"><span>Password</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === "register" ? "new-password" : "current-password"}/></label>}
          {error && <p className="account-error" role="alert">{error}</p>}
          {message && <p className="account-success" role="status">{message}</p>}
          {configured && <button className="button button-primary button-full" disabled={busy || !email.trim() || (mode !== "reset" && !password)} onClick={() => run(async () => {
            if (mode === "register") await register(name, email, password);
            else if (mode === "reset") { await resetPassword(email); setMessage("Password reset email sent. Check your inbox."); }
            else await signIn(email, password);
          })}>{busy ? <LoaderCircle size={16} className="account-spinner"/> : null}{mode === "register" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in with email"}</button>}
          <div className="account-links">
            {mode === "signin" && configured && <button onClick={()=>changeMode("reset")}>Forgot password?</button>}
            {mode !== "register" ? <button onClick={()=>changeMode("register")}>Create account</button> : <button onClick={()=>changeMode("signin")}>Already have an account? Sign in</button>}
            {mode === "reset" && <button onClick={()=>changeMode("signin")}>Back to sign in</button>}
          </div>
          <p className="account-footnote">No payment details or paid services are required for this authentication interface. Firebase must be configured on its no-cost plan before sign-in can work.</p>
        </>}
      </section>
    </div>}
  </>;
}
