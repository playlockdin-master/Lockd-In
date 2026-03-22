// Monetag Multitag SW (zone 10759289) — merged with Push Notifications (zone 10759202)
// Both zones run from a single service worker to avoid registration conflicts.
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 10759289
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')
