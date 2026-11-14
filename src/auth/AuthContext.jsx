import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  updateProfile
} from "firebase/auth";
import { auth, firebaseReady } from "../firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }
    let unsubscribe = () => {};
    setPersistence(auth, browserLocalPersistence)
      .catch(error => console.error("Firebase auth persistence setup failed:", error))
      .finally(() => {
        unsubscribe = onAuthStateChanged(auth, nextUser => {
          setUser(nextUser);
          setLoading(false);
        }, error => {
          console.error("Firebase auth state listener failed:", error);
          setUser(null);
          setLoading(false);
        });
      });
    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    configured: firebaseReady,
    signIn: (email, password) => {
      if (!auth) throw new Error("Firebase is not configured yet.");
      return signInWithEmailAndPassword(auth, email.trim(), password);
    },
    register: async (name, email, password) => {
      if (!auth) throw new Error("Firebase is not configured yet.");
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      return credential;
    },
    signInWithGoogle: () => {
      if (!auth) throw new Error("Firebase is not configured yet.");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return signInWithPopup(auth, provider);
    },
    resetPassword: (email) => {
      if (!auth) throw new Error("Firebase is not configured yet.");
      return sendPasswordResetEmail(auth, email.trim());
    },
    signOut: () => {
      if (!auth) throw new Error("Firebase is not configured yet.");
      return signOut(auth);
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
