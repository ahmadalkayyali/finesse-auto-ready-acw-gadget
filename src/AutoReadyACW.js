/*
 * AutoReadyACW.js
 * Purpose: Return an agent to READY after a configurable ACW threshold.
 * Notes: This implementation uses direct Cisco Finesse REST calls from within the Finesse desktop context.
 */

var AutoReadyACW = (function () {
    "use strict";

    var CONFIG = {
        // Example Finesse Not Ready reason code for ACW. Change this to match your environment.
        ACW_REASON_CODE: "20",
        ACW_REASON_LABELS: ["acw", "after call work"],

        // Default threshold: 3 minutes.
        ACW_LIMIT_MS: 180000,

        // Polling interval. Keep this reasonable; 5 seconds is enough for this use case.
        POLL_MS: 5000,

        // Optional team allow-list. Keep false until you confirm the User API returns the expected team name.
        ENFORCE_TEAM: false,
        ALLOWED_TEAMS: ["Example_Test_Team", "Example_Production_Team"],

        ALLOW_MANUAL_USER_ID: true
    };

    var _userId = "";
    var _pollTimer = null;
    var _acwTimer = null;
    var _countdownTimer = null;
    var _timerStartedAt = null;
    var _lastState = null;
    var _lastReasonCode = null;
    var _lastReasonLabel = null;
    var _lastTeamName = null;

    function byId(id) {
        return document.getElementById(id);
    }

    function setHtml(id, html) {
        var el = byId(id);
        if (el) {
            el.innerHTML = html;
        }
    }

    function nowText() {
        return new Date().toLocaleTimeString();
    }

    function log(msg) {
        var text = nowText() + "  " + msg;
        if (window.console && console.log) {
            console.log("[AutoReadyACW] " + text);
        }

        var panel = byId("logPanel");
        if (panel) {
            var row = document.createElement("div");
            row.className = "log-row";
            row.appendChild(document.createTextNode(text));
            panel.insertBefore(row, panel.firstChild);
            while (panel.childNodes.length > 10) {
                panel.removeChild(panel.lastChild);
            }
        }

        adjustHeight();
    }

    function adjustHeight() {
        try {
            if (window.gadgets && gadgets.window && gadgets.window.adjustHeight) {
                gadgets.window.adjustHeight();
            }
        } catch (ignore) {}
    }

    function norm(v) {
        return String(v || "").replace(/^\s+|\s+$/g, "").toLowerCase();
    }

    function getQueryParam(name) {
        var regex = new RegExp("[?&]" + name + "=([^&#]*)", "i");
        var match = regex.exec(window.location.search || "");
        return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : "";
    }

    function getPref(name) {
        try {
            if (window.gadgets && gadgets.Prefs) {
                var prefs = new gadgets.Prefs();
                return prefs.getString(name) || "";
            }
        } catch (ignore) {}
        return "";
    }

    function detectUserId() {
        var id = "";

        id = getPref("id");
        if (!id || id.indexOf("__UP_") === 0) {
            id = "";
        }

        if (!id) {
            id = getQueryParam("id") || getQueryParam("userId") || getQueryParam("agentId") || getQueryParam("loginId");
        }

        // Last fallback: try to read from URL path/query. Manual box will still be available if this fails.
        return String(id || "");
    }

    function userApiUrl() {
        return "/finesse/api/User/" + encodeURIComponent(_userId);
    }

    function xmlText($xml, tagName) {
        var val = "";
        try {
            val = $xml.find(tagName).first().text();
        } catch (ignore) {}
        return val || "";
    }

    function parseUserXml(xml) {
        var $xml = $(xml);
        var state = xmlText($xml, "state");
        var teamName = xmlText($xml, "teamName");
        var reasonCode = "";
        var reasonLabel = "";
        var reasonId = "";

        // Finesse commonly returns a reasonCode object under User when agent is Not Ready.
        var $reason = $xml.find("reasonCode").first();
        if ($reason && $reason.length) {
            reasonId = $reason.find("id").first().text() || "";
            reasonCode = $reason.find("code").first().text() || "";
            reasonLabel = $reason.find("label").first().text() || "";
        }

        // Fallbacks for environments that expose reasonCodeId separately.
        if (!reasonId) {
            reasonId = xmlText($xml, "reasonCodeId") || xmlText($xml, "notReadyReasonCodeId");
        }
        if (!reasonCode) {
            reasonCode = reasonId;
        }
        if (!reasonLabel) {
            reasonLabel = xmlText($xml, "reasonCodeLabel");
        }

        return {
            state: String(state || ""),
            teamName: String(teamName || ""),
            reasonId: String(reasonId || ""),
            reasonCode: String(reasonCode || ""),
            reasonLabel: String(reasonLabel || "")
        };
    }

    function isAllowedTeam(user) {
        if (!CONFIG.ENFORCE_TEAM) {
            return true;
        }

        var current = norm(user.teamName);
        for (var i = 0; i < CONFIG.ALLOWED_TEAMS.length; i++) {
            if (current === norm(CONFIG.ALLOWED_TEAMS[i])) {
                return true;
            }
        }
        return false;
    }

    function isAcw(user) {
        var state = String(user.state || "").toUpperCase();
        var code = String(user.reasonCode || user.reasonId || "");
        var label = norm(user.reasonLabel);
        var labelMatch = false;
        var i;

        for (i = 0; i < CONFIG.ACW_REASON_LABELS.length; i++) {
            if (label === CONFIG.ACW_REASON_LABELS[i] || label.indexOf(CONFIG.ACW_REASON_LABELS[i]) >= 0) {
                labelMatch = true;
                break;
            }
        }

        // Primary target: NOT_READY with ACW reason code 20.
        // Also keep WORK states as fallback because some deployments display ACW/wrap-up differently.
        return isAllowedTeam(user) && (
            (state === "NOT_READY" && code === CONFIG.ACW_REASON_CODE) ||
            (state === "NOT_READY" && labelMatch) ||
            state === "WORK" ||
            state === "WORK_READY" ||
            state === "WORK_NOT_READY"
        );
    }

    function updateDetails(user) {
        _lastState = user.state;
        _lastReasonCode = user.reasonCode || user.reasonId;
        _lastReasonLabel = user.reasonLabel;
        _lastTeamName = user.teamName;

        setHtml(
            "detailsLine",
            "State: <b>" + escapeHtml(user.state || "unknown") + "</b>" +
            " | Reason: <b>" + escapeHtml(user.reasonLabel || user.reasonCode || user.reasonId || "none") + "</b>" +
            " | Team: <b>" + escapeHtml(user.teamName || "unknown") + "</b>"
        );
    }

    function escapeHtml(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function pollUser() {
        if (!_userId) {
            return;
        }

        $.ajax({
            url: userApiUrl(),
            type: "GET",
            cache: false,
            dataType: "xml",
            success: function (xml) {
                var user = parseUserXml(xml);
                updateDetails(user);

                log("Poll: state=" + user.state + " team=" + user.teamName + " reasonCode=" + (user.reasonCode || user.reasonId) + " reasonLabel=" + user.reasonLabel);

                if (isAcw(user)) {
                    startAcwTimer();
                } else {
                    clearAcwTimer("Agent is not in ACW.");
                    setHtml("statusLine", "Auto-Ready Status: Monitoring ACW...");
                    setHtml("timerLine", "No active ACW timer.");
                }
            },
            error: function (xhr, textStatus, errorThrown) {
                setHtml("statusLine", "<span class='bad'>Auto-Ready Status: User API GET failed.</span>");
                setHtml("timerLine", "HTTP " + (xhr ? xhr.status : "unknown") + " - " + escapeHtml(errorThrown || textStatus || "error"));
                log("User API GET failed. HTTP=" + (xhr ? xhr.status : "unknown") + " status=" + textStatus + " error=" + errorThrown);
            }
        });
    }

    function startPolling() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
        }
        pollUser();
        _pollTimer = setInterval(pollUser, CONFIG.POLL_MS);
    }

    function startAcwTimer() {
        if (_acwTimer) {
            updateCountdown();
            return;
        }

        _timerStartedAt = new Date().getTime();
        setHtml("statusLine", "<span class='warn'>ACW detected — 3-minute auto-ready timer started.</span>");
        log("ACW detected. Starting 3-minute timer.");

        _countdownTimer = setInterval(updateCountdown, 1000);
        updateCountdown();

        _acwTimer = setTimeout(function () {
            log("ACW timer expired. Rechecking current state before sending READY.");
            recheckAndSetReady();
        }, CONFIG.ACW_LIMIT_MS);
    }

    function updateCountdown() {
        if (!_timerStartedAt) {
            return;
        }
        var elapsed = new Date().getTime() - _timerStartedAt;
        var remaining = Math.max(0, CONFIG.ACW_LIMIT_MS - elapsed);
        var seconds = Math.ceil(remaining / 1000);
        var min = Math.floor(seconds / 60);
        var sec = seconds % 60;
        setHtml("timerLine", "Agent will be placed back to Ready in <b>" + min + ":" + (sec < 10 ? "0" + sec : sec) + "</b>.");
    }

    function clearAcwTimer(reason) {
        if (_acwTimer) {
            clearTimeout(_acwTimer);
            _acwTimer = null;
        }
        if (_countdownTimer) {
            clearInterval(_countdownTimer);
            _countdownTimer = null;
        }
        _timerStartedAt = null;
        if (reason) {
            log("ACW timer cleared. " + reason);
        }
    }

    function recheckAndSetReady() {
        $.ajax({
            url: userApiUrl(),
            type: "GET",
            cache: false,
            dataType: "xml",
            success: function (xml) {
                var user = parseUserXml(xml);
                updateDetails(user);

                if (isAcw(user)) {
                    sendReady();
                } else {
                    log("Timer expired, but agent is no longer in ACW. No action taken.");
                    clearAcwTimer("Timer completed; no READY needed.");
                }
            },
            error: function (xhr, textStatus, errorThrown) {
                setHtml("statusLine", "<span class='bad'>Auto-Ready Status: Recheck failed.</span>");
                log("Recheck GET failed. HTTP=" + (xhr ? xhr.status : "unknown") + " status=" + textStatus + " error=" + errorThrown);
                clearAcwTimer("Recheck failed.");
            }
        });
    }

    function sendReady() {
        var payload = "<User><state>READY</state></User>";
        setHtml("statusLine", "<span class='warn'>ACW limit reached — sending Ready request...</span>");
        log("Sending READY PUT to " + userApiUrl());

        $.ajax({
            url: userApiUrl(),
            type: "PUT",
            data: payload,
            contentType: "application/xml",
            dataType: "xml",
            success: function () {
                setHtml("statusLine", "<span class='good'>Ready request sent successfully.</span>");
                setHtml("timerLine", "Agent should now be Ready.");
                log("READY PUT succeeded.");
                clearAcwTimer("READY sent.");
                setTimeout(pollUser, 1500);
            },
            error: function (xhr, textStatus, errorThrown) {
                setHtml("statusLine", "<span class='bad'>Ready request failed.</span>");
                setHtml("timerLine", "HTTP " + (xhr ? xhr.status : "unknown") + " - " + escapeHtml(errorThrown || textStatus || "error"));
                log("READY PUT failed. HTTP=" + (xhr ? xhr.status : "unknown") + " status=" + textStatus + " error=" + errorThrown + " body=" + (xhr ? xhr.responseText : ""));
                clearAcwTimer("READY failed.");
            }
        });
    }

    function showManualPanel() {
        var panel = byId("manualUserPanel");
        if (panel && CONFIG.ALLOW_MANUAL_USER_ID) {
            panel.className = "manual-panel";
        }

        var btn = byId("manualStartBtn");
        if (btn) {
            btn.onclick = function () {
                var input = byId("manualUserId");
                var val = input ? input.value : "";
                if (val) {
                    panel.className = "manual-panel hidden";
                    begin(val);
                }
            };
        }
    }

    function begin(userId) {
        _userId = String(userId || "");
        setHtml("statusLine", "Auto-Ready Status: Monitoring ACW...");
        setHtml("timerLine", "ACW reason code: <b>" + CONFIG.ACW_REASON_CODE + "</b>. Limit: <b>3 minutes</b>.");
        log("Monitoring Finesse user ID: " + _userId + ". Team enforcement: " + (CONFIG.ENFORCE_TEAM ? "enabled" : "disabled") + ".");
        startPolling();
        adjustHeight();
    }

    function init() {
        setHtml("statusLine", "Auto-Ready Status: Initializing REST mode...");
        var detected = detectUserId();
        log("Detected user ID from gadget prefs/query: " + (detected || "undefined"));

        if (detected) {
            begin(detected);
        } else {
            setHtml("statusLine", "<span class='bad'>Auto-Ready Status: User ID was not detected.</span>");
            setHtml("timerLine", "Enter the agent login ID below to start testing.");
            showManualPanel();
        }
        adjustHeight();
    }

    return {
        init: init,
        begin: begin
    };
}());

// Do not use gadgets.HubSettings.onConnect in this version. That was causing OpenAjax disconnected errors.
if (window.gadgets && gadgets.util && gadgets.util.registerOnLoadHandler) {
    gadgets.util.registerOnLoadHandler(AutoReadyACW.init);
} else {
    $(document).ready(AutoReadyACW.init);
}
