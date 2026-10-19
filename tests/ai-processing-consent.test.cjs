const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function fixture() {
    function element(tag) {
        return {
            tag,
            children: [],
            events: {},
            append(...nodes) { this.children.push(...nodes); },
            remove() { this.removed = true; },
            setAttribute(name, value) { this[name] = value; },
            addEventListener(name, handler) { this.events[name] = handler; },
            focus() {}
        };
    }
    const document = {
        head: element('head'),
        body: element('body'),
        activeElement: element('previous'),
        createElement: element,
        addEventListener() {},
        removeEventListener() {}
    };
    const window = {};
    vm.runInNewContext(
        readFileSync(join(__dirname, '../scripts/ai-processing-consent.js'), 'utf8'),
        { document, window }
    );
    return { document, request: window.MscAiConsent.request };
}

test('AI permission is per action and a concurrent request cannot reuse it', async () => {
    const { document, request } = fixture();
    const first = request({ feature: 'CV Review', data: 'your CV' });
    const concurrent = await request({ feature: 'Interview', data: 'audio' });
    assert.equal(concurrent, false);
    const card = document.body.children[0].children[0];
    assert.match(card.children[0].textContent, /CV Review/);
    assert.match(card.children[1].textContent, /external AI model providers/);
    const buttons = card.children[4].children;
    buttons[0].events.click();
    assert.equal(await first, false);

    const second = request({ feature: 'Interview', data: 'audio' });
    const secondCard = document.body.children[1].children[0];
    secondCard.children[4].children[1].events.click();
    assert.equal(await second, true);
});
