import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

type Delivery = {
  reminder_id: string;
  device_id: string;
  due_at: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

// Subscription endpoints are user input. Only send to recognized Web Push services.
function supportedEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
        host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const token = request.headers.get("x-stash-dispatch");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return new Response(null, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const auth = await db.rpc("authorize_reminder_dispatch", { candidate: token });
  if (auth.error || auth.data !== true) return new Response(null, { status: 401 });

  try {
    let { data: keys, error } = await db.rpc("reminder_vapid_keys");
    if (!error && !keys) {
      ({ data: keys, error } = await db.rpc("reminder_vapid_keys", { proposed: webpush.generateVAPIDKeys() }));
    }
    if (error || !keys) throw new Error("Could not load VAPID configuration");

    const claim = await db.rpc("claim_reminder_pushes");
    if (claim.error) throw new Error("Could not claim due reminders");
    const jobs = claim.data as Delivery[];
    let sent = 0;
    let failed = 0;

    async function deliver(job: Delivery) {
      if (!supportedEndpoint(job.endpoint)) {
        await db.from("reminder_push_devices").delete().eq("id", job.device_id);
        return;
      }

      try {
        await webpush.sendNotification(
          { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth_key } },
          JSON.stringify({
            title: "Stash reminder",
            body: "You have a reminder due.",
            tag: `${job.reminder_id}:${new Date(job.due_at).toISOString()}`,
            url: "/calendar?view=agenda",
          }),
          {
            TTL: 600,
            timeout: 6000,
            vapidDetails: { ...keys, subject: url },
          },
        );
        const result = await db.from("reminder_push_deliveries")
          .update({ sent_at: new Date().toISOString() })
          .eq("reminder_id", job.reminder_id).eq("device_id", job.device_id).eq("due_at", job.due_at);
        if (result.error) throw new Error("Could not acknowledge reminder");
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("reminder_push_devices").delete().eq("id", job.device_id);
      }
    }

    for (let i = 0; i < jobs.length; i += 12) {
      await Promise.all(jobs.slice(i, i + 12).map(deliver));
    }
    return Response.json({ claimed: jobs.length, sent, failed });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reminder dispatch failed");
    return Response.json({ error: "Reminder dispatch failed" }, { status: 500 });
  }
});
