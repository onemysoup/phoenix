import { z } from "zod";
export const spaMonitorSchema = z.object({
    action: z
        .enum(["start", "stop", "get_changes"])
        .describe("'start' begins monitoring route changes, 'stop' stops monitoring, 'get_changes' returns collected changes"),
});
export async function handleSpaMonitor(session, params) {
    const page = session.getActivePage();
    switch (params.action) {
        case "start": {
            // Inject route monitoring script
            await page.evaluate(() => {
                if (window.__phoenix_route_monitor)
                    return; // already running
                const changes = [];
                const currentUrl = () => window.location.href;
                // Intercept pushState
                const origPush = history.pushState;
                history.pushState = function (...args) {
                    const from = currentUrl();
                    origPush.apply(this, args);
                    changes.push({
                        type: "pushState",
                        from,
                        to: currentUrl(),
                        timestamp: Date.now(),
                    });
                };
                // Intercept replaceState
                const origReplace = history.replaceState;
                history.replaceState = function (...args) {
                    const from = currentUrl();
                    origReplace.apply(this, args);
                    changes.push({
                        type: "replaceState",
                        from,
                        to: currentUrl(),
                        timestamp: Date.now(),
                    });
                };
                // Listen for popstate (back/forward)
                const onPopState = () => {
                    changes.push({
                        type: "popstate",
                        from: "",
                        to: currentUrl(),
                        timestamp: Date.now(),
                    });
                };
                window.addEventListener("popstate", onPopState);
                // Listen for hashchange
                const onHashChange = (e) => {
                    changes.push({
                        type: "hashchange",
                        from: e.oldURL,
                        to: e.newURL,
                        timestamp: Date.now(),
                    });
                };
                window.addEventListener("hashchange", onHashChange);
                window.__phoenix_route_monitor = {
                    changes,
                    getChanges: () => [...changes],
                    clearChanges: () => {
                        changes.length = 0;
                    },
                    stop: () => {
                        history.pushState = origPush;
                        history.replaceState = origReplace;
                        window.removeEventListener("popstate", onPopState);
                        window.removeEventListener("hashchange", onHashChange);
                    },
                };
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            action: "start",
                            message: "SPA route monitor started. Use action='get_changes' to retrieve changes.",
                        }),
                    },
                ],
            };
        }
        case "stop": {
            await page.evaluate(() => {
                const monitor = window.__phoenix_route_monitor;
                monitor?.stop?.();
                delete window.__phoenix_route_monitor;
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            action: "stop",
                            message: "SPA route monitor stopped and cleaned up.",
                        }),
                    },
                ],
            };
        }
        case "get_changes": {
            const changes = await page.evaluate(() => {
                const monitor = window.__phoenix_route_monitor;
                if (!monitor)
                    return null;
                const result = monitor.getChanges();
                monitor.clearChanges();
                return result;
            });
            if (changes === null) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: "Route monitor not started. Use action='start' first.",
                            }),
                        },
                    ],
                    isError: true,
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            action: "get_changes",
                            count: changes.length,
                            changes,
                        }),
                    },
                ],
            };
        }
    }
}
//# sourceMappingURL=spa-monitor.js.map