"use client";

import { createClient } from "@/lib/supabase/client";

export function supportsReminderPush() {
  return "serviceWorker" in navigator && typeof PushManager !== "undefined";
}

export async function getReminderPushKey() {
  const { data, error } = await createClient().from("reminder_push_config").select("public_key").maybeSingle();
  if (error) throw error;
  return data?.public_key as string | undefined;
}

export async function getReminderPushRegistration() {
  if (!supportsReminderPush()) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function registeredReminderPush() {
  const registration = await getReminderPushRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { data, error } = await createClient().from("reminder_push_devices").select("id").eq("endpoint", subscription.endpoint).maybeSingle();
  if (error) throw error;
  return !!data;
}

function decodeKey(key: string) {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
}

export async function enableReminderPush(key: string) {
  const registration = await getReminderPushRegistration();
  if (!registration?.active) throw new Error("Reload Stash to finish setting up notifications.");
  const prior = await registration.pushManager.getSubscription();
  const subscription = prior ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) });
  const { keys } = subscription.toJSON();
  try {
    if (!keys?.p256dh || !keys.auth) throw new Error("The browser did not provide notification keys.");
    const { error } = await createClient().from("reminder_push_devices").upsert(
      { endpoint: subscription.endpoint, p256dh: keys.p256dh.replace(/=+$/, ""), auth_key: keys.auth.replace(/=+$/, "") },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
  } catch (error) {
    if (!prior) await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
}

export async function disableReminderPush() {
  const registration = await getReminderPushRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe();
  const { error } = await createClient().from("reminder_push_devices").delete().eq("endpoint", subscription.endpoint);
  if (error) throw error;
}
