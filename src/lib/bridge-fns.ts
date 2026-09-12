import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getBridgeStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { getStatus } = await import("@/lib/bridge-db.server");
  return getStatus();
});

export const openTheLine = createServerFn({ method: "POST" }).handler(async () => {
  const { setupBridge } = await import("@/lib/bridge-db.server");
  return setupBridge();
});

const keyed = z.object({ key: z.string().min(8) });

export const loadThread = createServerFn({ method: "POST" })
  .validator(keyed)
  .handler(async ({ data }) => {
    const { requireParty, listThread } = await import("@/lib/bridge-db.server");
    await requireParty(data.key);
    return listThread();
  });

export const sendFromConsole = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().min(8),
      text: z.string().min(1).max(8000),
    }),
  )
  .handler(async ({ data }) => {
    const { requireParty, sendMessage } = await import("@/lib/bridge-db.server");
    const party = await requireParty(data.key);
    return sendMessage(party, data.text);
  });

export const saveWebhook = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().min(8),
      url: z.string(),
      wakeKey: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { requireParty, setChiefWebhook, getStatus } = await import("@/lib/bridge-db.server");
    const party = await requireParty(data.key);
    if (party !== "build") throw new Error("Only Grok Build can set the Chief webhook.");
    await setChiefWebhook(data.url, data.wakeKey);
    return getStatus();
  });

export const saveBuildWebhook = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().min(8),
      url: z.string(),
      wakeKey: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { requireParty, setBuildWebhook, getStatus } = await import("@/lib/bridge-db.server");
    const party = await requireParty(data.key);
    if (party !== "build") throw new Error("Only Grok Build can set the Build webhook.");
    await setBuildWebhook(data.url, data.wakeKey);
    return getStatus();
  });

export const whoAmI = createServerFn({ method: "POST" })
  .validator(keyed)
  .handler(async ({ data }) => {
    const { requireParty } = await import("@/lib/bridge-db.server");
    return { party: await requireParty(data.key) };
  });

export const recoverBuildKey = createServerFn({ method: "POST" })
  .validator(z.object({ chiefKey: z.string().min(8) }))
  .handler(async ({ data }) => {
    const { rotateBuildKey } = await import("@/lib/bridge-db.server");
    return rotateBuildKey(data.chiefKey);
  });

