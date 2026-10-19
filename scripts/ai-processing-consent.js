/* Per-use permission for sending student content to external AI processors. */
(function () {
    'use strict';
    let pending = null;

    function request({ feature, data }) {
        // A second feature must not inherit permission from the first.
        if (pending) return Promise.resolve(false);
        pending = new Promise((resolve) => {
            const style = document.createElement('style');
            style.textContent = `
                .msc-ai-consent-backdrop { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-items: center; padding: 18px; background: rgba(12, 24, 48, .72); }
                .msc-ai-consent-card { box-sizing: border-box; width: min(100%, 440px); max-height: min(90vh, 680px); overflow-y: auto; border-radius: 18px; padding: 24px; background: #fff; color: #102038; box-shadow: 0 20px 70px rgba(0, 0, 0, .3); font: 15px/1.5 system-ui, sans-serif; }
                .msc-ai-consent-card h2 { margin: 0 0 12px; font-size: 21px; line-height: 1.25; }
                .msc-ai-consent-card p { margin: 0 0 12px; }
                .msc-ai-consent-card a { color: #155bd1; }
                .msc-ai-consent-actions { display: flex; gap: 10px; margin-top: 20px; }
                .msc-ai-consent-actions button { flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; color: #102038; font: 600 14px system-ui, sans-serif; cursor: pointer; }
                .msc-ai-consent-actions .msc-ai-consent-allow { border-color: #2563eb; background: #2563eb; color: #fff; }
            `;
            const backdrop = document.createElement('div');
            backdrop.className = 'msc-ai-consent-backdrop';
            backdrop.setAttribute('role', 'presentation');
            const card = document.createElement('div');
            card.className = 'msc-ai-consent-card';
            card.setAttribute('role', 'dialog');
            card.setAttribute('aria-modal', 'true');
            card.setAttribute('aria-labelledby', 'msc-ai-consent-title');
            const title = document.createElement('h2');
            title.id = 'msc-ai-consent-title';
            title.textContent = `Share data for ${feature}?`;
            const details = document.createElement('p');
            details.textContent = `If you continue, My Student Club will send ${data} to its Cloudflare service and external AI model providers to deliver this feature. The AI provider will process that content to generate feedback.`;
            const choice = document.createElement('p');
            choice.textContent = 'This is optional. Declining stops this AI action. Permission applies only to this action; you will be asked again next time.';
            const policy = document.createElement('a');
            policy.href = '/privacy-policy.html';
            policy.target = '_blank';
            policy.rel = 'noopener noreferrer';
            policy.textContent = 'Read Privacy Policy';
            const actions = document.createElement('div');
            actions.className = 'msc-ai-consent-actions';
            const decline = document.createElement('button');
            decline.type = 'button';
            decline.textContent = 'Not now';
            const allow = document.createElement('button');
            allow.type = 'button';
            allow.className = 'msc-ai-consent-allow';
            allow.textContent = 'Allow this time';
            actions.append(decline, allow);
            card.append(title, details, choice, policy, actions);
            backdrop.append(card);
            document.head.append(style);
            document.body.append(backdrop);
            const priorFocus = document.activeElement;
            function finish(allowed) {
                document.removeEventListener('keydown', onKeyDown);
                backdrop.remove();
                style.remove();
                pending = null;
                if (priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus();
                resolve(allowed);
            }
            function onKeyDown(event) {
                if (event.key === 'Escape') finish(false);
            }
            decline.addEventListener('click', () => finish(false));
            allow.addEventListener('click', () => finish(true));
            backdrop.addEventListener('click', (event) => {
                if (event.target === backdrop) finish(false);
            });
            document.addEventListener('keydown', onKeyDown);
            decline.focus();
        });
        return pending;
    }

    window.MscAiConsent = { request };
})();
