import { LightningElement, api, track } from 'lwc';
import startSession from '@salesforce/apex/KioskAgentforceController.startSession';
import sendMessage from '@salesforce/apex/KioskAgentforceController.sendMessage';
import endSession from '@salesforce/apex/KioskAgentforceController.endSession';

export default class AgentforceChat extends LightningElement {
    @api supervisorName;
    // The work order the user is currently viewing; can change mid-conversation.
    @api workOrderId;

    @track open = false;
    @track messages = [];   // { id, role: 'user'|'agent', text }
    @track draft = '';
    @track isThinking = false;
    @track errorMessage = '';

    _sessionId = null;
    _seq = 1;
    _msgKey = 0;
    _starting = false;

    // Shell-style input history: last 10 sent prompts, newest last.
    _history = [];
    _historyIdx = null;   // null = editing a fresh draft; else index into _history
    _stashedDraft = '';   // unsent text preserved while browsing history
    HISTORY_MAX = 10;

    // ---- launcher / panel toggle ------------------------------------------

    get panelClass() {
        return 'af-panel' + (this.open ? ' af-open' : '');
    }
    get launcherLabel() {
        return this.open ? 'Close assistant' : 'Ask Agentforce';
    }
    get sendDisabled() {
        return this.isThinking || !this.draft || !this.draft.trim();
    }
    get hasMessages() {
        return this.messages.length > 0;
    }

    async handleToggle() {
        this.open = !this.open;
        if (this.open && !this._sessionId && !this._starting) {
            await this._ensureSession();
        }
        if (this.open) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            Promise.resolve().then(() => this._focusInput());
        }
    }

    // ---- session lifecycle -------------------------------------------------

    async _ensureSession() {
        this._starting = true;
        this.isThinking = true;
        this.errorMessage = '';
        try {
            const s = await startSession();
            this._sessionId = s.sessionId;
            this._seq = 1;
            if (s.greeting) {
                this._push('agent', s.greeting);
            }
        } catch (e) {
            this.errorMessage = this._friendly(e);
        } finally {
            this.isThinking = false;
            this._starting = false;
        }
    }

    @api
    async reset() {
        // Called by parent on idle-logout / end session.
        const sid = this._sessionId;
        this._sessionId = null;
        this._seq = 1;
        this.messages = [];
        this._history = [];       // don't carry one worker's prompts to the next
        this._historyIdx = null;
        this._stashedDraft = '';
        this._clearInput();
        this.open = false;
        this.errorMessage = '';
        if (sid) {
            try { await endSession({ sessionId: sid }); } catch (e) { /* best-effort */ }
        }
    }

    // ---- sending -----------------------------------------------------------

    handleInput(evt) {
        this.draft = evt.target.value;
        // Typing exits history-browsing mode.
        this._historyIdx = null;
    }

    // Required on the kiosk: stop the global barcode keydown handler in
    // workshopPortal from stealing focus/keystrokes (see CLAUDE.md).
    handleInputKeydown(evt) {
        evt.stopPropagation();
        if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            this.handleSend();
            return;
        }
        if (evt.key === 'ArrowUp') {
            evt.preventDefault();
            this._historyStep(-1);
        } else if (evt.key === 'ArrowDown') {
            evt.preventDefault();
            this._historyStep(1);
        }
    }

    // Cycle through prior prompts. dir -1 = older, +1 = newer.
    _historyStep(dir) {
        if (this._history.length === 0) return;
        if (this._historyIdx === null) {
            // entering history from a fresh draft
            if (dir > 0) return;            // nothing newer than the draft
            this._stashedDraft = this.draft;
            this._historyIdx = this._history.length - 1;
        } else {
            const next = this._historyIdx + dir;
            if (next < 0) return;           // already at oldest
            if (next >= this._history.length) {
                // stepped past newest → back to the stashed draft
                this._historyIdx = null;
                this._setInput(this._stashedDraft);
                return;
            }
            this._historyIdx = next;
        }
        this._setInput(this._history[this._historyIdx]);
    }

    // Set the input value (property + DOM, since <textarea> won't repaint from JS alone)
    // and place the caret at the end.
    _setInput(value) {
        this.draft = value || '';
        const ta = this.template.querySelector('[data-id="chatInput"]');
        if (ta) {
            ta.value = this.draft;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            Promise.resolve().then(() => {
                const end = this.draft.length;
                try { ta.setSelectionRange(end, end); } catch (e) { /* ignore */ }
                ta.focus();
            });
        }
    }

    _recordHistory(text) {
        // De-dupe consecutive repeats; keep newest last; cap at HISTORY_MAX.
        if (this._history.length === 0 || this._history[this._history.length - 1] !== text) {
            this._history.push(text);
            if (this._history.length > this.HISTORY_MAX) this._history.shift();
        }
        this._historyIdx = null;
        this._stashedDraft = '';
    }

    async handleSend() {
        const text = (this.draft || '').trim();
        if (!text || this.isThinking) return;

        if (!this._sessionId) {
            await this._ensureSession();
            if (!this._sessionId) return; // start failed; error already shown
        }

        this._push('user', text);
        this._recordHistory(text);
        this._clearInput();
        this.isThinking = true;
        this.errorMessage = '';
        try {
            const r = await sendMessage({
                sessionId: this._sessionId,
                text,
                sequenceId: this._seq,
                workOrderId: this.workOrderId,
            });
            this._seq = r.nextSeq || this._seq + 1;
            this._push('agent', r.text || '…', r.blocksJson);
        } catch (e) {
            this.errorMessage = this._friendly(e);
        } finally {
            this.isThinking = false;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            Promise.resolve().then(() => this._scrollToEnd());
        }
    }

    // ---- helpers -----------------------------------------------------------

    _push(role, text, blocksJson) {
        const id = `m${this._msgKey++}`;
        const blocks = this._parseBlocks(blocksJson);
        this.messages = [
            ...this.messages,
            {
                id,
                role,
                text,
                cssClass: `af-msg af-${role}`,
                lines: this._formatLines(id, text),
                hasText: !!(text && text.trim()),
                blocks,
                hasBlocks: blocks.length > 0,
            },
        ];
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        Promise.resolve().then(() => this._scrollToEnd());
    }

    _parseBlocks(blocksJson) {
        if (!blocksJson) return [];
        try {
            const parsed = JSON.parse(blocksJson);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    // Render agent markdown safely (no innerHTML): split into lines, each line
    // into bold/plain segments. Handles **bold** and --- horizontal rules.
    _formatLines(msgId, text) {
        const raw = (text || '').split('\n');
        return raw.map((line, li) => {
            const trimmed = line.trim();
            const isRule = trimmed === '---' || trimmed === '***' || trimmed === '___';
            const segments = isRule
                ? []
                : line.split(/(\*\*[^*]+\*\*)/g)
                      .filter((s) => s.length)
                      .map((s, si) => {
                          const bold = s.startsWith('**') && s.endsWith('**');
                          return {
                              key: `${msgId}-${li}-${si}`,
                              text: bold ? s.slice(2, -2) : s,
                              cssClass: bold ? 'af-seg af-bold' : 'af-seg',
                          };
                      });
            return {
                key: `${msgId}-l${li}`,
                isRule,
                isBlank: !isRule && trimmed === '',
                segments,
            };
        });
    }

    // <textarea value={draft}> does NOT repaint when draft is set in JS (LWC quirk,
    // see CLAUDE.md). Clear the DOM node imperatively as well as the property.
    _clearInput() {
        this.draft = '';
        const ta = this.template.querySelector('[data-id="chatInput"]');
        if (ta) ta.value = '';
    }

    _scrollToEnd() {
        const log = this.template.querySelector('[data-id="log"]');
        if (log) log.scrollTop = log.scrollHeight;
    }

    _focusInput() {
        const ta = this.template.querySelector('[data-id="chatInput"]');
        if (ta) ta.focus();
    }

    _friendly(e) {
        const msg = (e && e.body && e.body.message) || (e && e.message) || '';
        if (msg.includes('AGENT_API_ERROR') || msg.includes('AGENT_SESSION_FAILED')) {
            return 'The assistant is unavailable right now. Please try again.';
        }
        return 'Something went wrong. Please try again.';
    }
}
