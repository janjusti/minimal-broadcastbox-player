(function () {
    var el = document.getElementById("debug");
    if (!el) {
        el = document.createElement("div");
        el.id = "debug";
        document.getElementById("container").appendChild(el);
    }

    var lastBytes = 0;
    var lastTime = 0;
    var sessBytes = 0;
    var sessTime = 0;
    var statsWindow = [];
    var lastStats = null;

    function fmtUptime(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return (
            (h < 10 ? "0" + h : h) +
            ":" +
            (m < 10 ? "0" + m : m) +
            ":" +
            (s < 10 ? "0" + s : s)
        );
    }

    function fetchStats() {
        var S = window.__state;
        var pc = S.pc;
        if (!pc) return;
        pc.getStats(null)
            .then(function (stats) {
                var video = null;
                var codecStr = null;
                var rtt = null;
                stats.forEach(function (r) {
                    if (
                        r.type === "inbound-rtp" &&
                        r.kind === "video"
                    ) {
                        video = r;
                    }
                    if (
                        r.type === "candidate-pair" &&
                        r.state === "succeeded" &&
                        r.currentRoundTripTime != null
                    ) {
                        rtt = r.currentRoundTripTime;
                    }
                });
                if (video && video.codecId) {
                    var cr = stats.get(video.codecId);
                    if (cr && cr.mimeType) {
                        codecStr = cr.mimeType.split("/")[1];
                    }
                }
                var kbps = 0;
                var avgKbps = 0;
                var now = Date.now();
                if (video) {
                    var bytes = video.bytesReceived || 0;
                    if (lastTime && now > lastTime) {
                        kbps = Math.round(
                            ((bytes - lastBytes) * 8) / (now - lastTime)
                        );
                    }
                    if (!sessTime) {
                        sessTime = now;
                        sessBytes = bytes;
                    }
                    if (now > sessTime) {
                        avgKbps = Math.round(
                            ((bytes - sessBytes) * 8) / (now - sessTime)
                        );
                    }
                    lastBytes = bytes;
                    lastTime = now;
                }
                var snap = {
                    t: now,
                    pktsRcvd: video ? video.packetsReceived || 0 : 0,
                    pktsLost: video ? video.packetsLost || 0 : 0,
                    framesDec: video ? video.framesDecoded || 0 : 0,
                    framesDrop: video ? video.framesDropped || 0 : 0,
                };
                statsWindow.push(snap);
                var cutoff = now - 10000;
                while (
                    statsWindow.length > 1 &&
                    statsWindow[0].t < cutoff
                ) {
                    statsWindow.shift();
                }
                var wFirst = statsWindow[0];
                var wLast = statsWindow[statsWindow.length - 1];
                var wPkts =
                    wLast.pktsRcvd -
                    wFirst.pktsRcvd +
                    (wLast.pktsLost - wFirst.pktsLost);
                var wLossPct =
                    wPkts > 0
                        ? (
                              ((wLast.pktsLost - wFirst.pktsLost) /
                                  wPkts) *
                              100
                          ).toFixed(1)
                        : "0.0";
                var wFrames =
                    wLast.framesDec -
                    wFirst.framesDec +
                    (wLast.framesDrop - wFirst.framesDrop);
                var wDropPct =
                    wFrames > 0
                        ? (
                              ((wLast.framesDrop -
                                  wFirst.framesDrop) /
                                  wFrames) *
                              100
                          ).toFixed(1)
                        : "0.0";
                lastStats = {
                    video: video,
                    codec: codecStr,
                    kbps: kbps,
                    avgKbps: avgKbps,
                    rtt: rtt,
                    wLossPct: wLossPct,
                    wDropPct: wDropPct,
                };
            })
            .catch(function () {});
    }

    function update() {
        var S = window.__state;
        var pc = S.pc;
        var ice = pc ? pc.iceConnectionState : "\u2014";
        var conn = pc ? pc.connectionState : "\u2014";
        var sig = pc ? pc.signalingState : "\u2014";
        var uptime = S.connectedAt
            ? fmtUptime(Date.now() - S.connectedAt)
            : "\u2014";
        var key = S.streamKey;
        if (key.length > 28) {
            key = key.substring(0, 26) + "\u2026";
        }

        var rows = [
            ["stream", key],
            [
                "trk/ice/con",
                (S.trackReceived ? "y" : "n") +
                    "  " +
                    ice.substring(0, 4) +
                    "  " +
                    conn.substring(0, 4),
            ],
            ["signal", sig],
            [
                "retry",
                S.retryCount +
                    (S.isReconnecting ? " (reconnecting)" : ""),
            ],
            ["uptime", uptime],
        ];

        if (lastStats && lastStats.video) {
            var v = lastStats.video;
            rows.push(["", ""]);
            rows.push([
                "media",
                (v.frameWidth || "?") +
                    "\u00d7" +
                    (v.frameHeight || "?") +
                    "(" +
                    (v.framesPerSecond || "?") +
                    ") " +
                    (lastStats.codec || "\u2014"),
            ]);
            rows.push([
                "loss/drop",
                lastStats.wLossPct + "% / " + lastStats.wDropPct + "%",
            ]);
            rows.push([
                "rtt/jitter",
                (lastStats.rtt != null
                    ? (lastStats.rtt * 1000).toFixed(0) + " ms"
                    : "\u2014") +
                    " / " +
                    ((v.jitter || 0) * 1000).toFixed(1) +
                    " ms",
            ]);
            rows.push([
                "bitrate (avg)",
                lastStats.kbps + "kbps (" + lastStats.avgKbps + ")",
            ]);
            rows.push([
                "nack/pli",
                (v.nackCount || 0) + " / " + (v.pliCount || 0),
            ]);
            rows.push(["freezes", v.freezeCount || 0]);
        }

        var html = "<table>";
        for (var i = 0; i < rows.length; i++) {
            var cls =
                rows[i][0] === "" && rows[i][1] === ""
                    ? ' class="sep"'
                    : "";
            html +=
                "<tr><td" +
                cls +
                ">" +
                rows[i][0] +
                "</td><td" +
                cls +
                ">" +
                rows[i][1] +
                "</td></tr>";
        }
        html += "</table>";
        el.innerHTML = html;
        el.style.display = "block";

        /* fit font so panel stays within 50vh */
        var pad = 16;
        var maxH = window.innerHeight * 0.5 - pad;
        var size = Math.min(12, Math.floor(maxH / (rows.length * 1.5)));
        if (size < 7) size = 7;
        el.style.fontSize = size + "px";
    }

    function resetSession() {
        sessTime = 0;
        sessBytes = 0;
        statsWindow = [];
        lastStats = null;
    }

    /* hook into main state */
    window.__debug = {
        update: update,
        resetSession: resetSession,
    };

    setInterval(function () {
        fetchStats();
        update();
    }, 1000);
})();
