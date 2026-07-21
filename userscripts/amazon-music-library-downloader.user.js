// ==UserScript==
// @name         Amazon Music Library Downloader
// @namespace    https://softwareengineerprogrammer.github.io/
// @version      1.0
// @description  Automates downloading of all songs in Amazon Music library via quasi-infinite scroll
// @match        https://music.amazon.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'amz_downloaded_keys';
    let isRunning = false;
    let downloadedKeys = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    let skippedKeys = new Set();

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /*
     * Injects a fixed control panel into the bottom right of the viewport
     * to manage the run state and clear persistent storage.
     */
    function setupUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.backgroundColor = '#1a1a1a';
        container.style.color = '#ffffff';
        container.style.padding = '16px';
        container.style.borderRadius = '8px';
        container.style.zIndex = '999999';
        container.style.fontFamily = 'sans-serif';
        container.style.border = '1px solid #333';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

        const statusText = document.createElement('div');
        statusText.id = 'amz-dl-status';
        statusText.innerText = `Downloaded: ${downloadedKeys.size} | Skipped: 0`;
        container.appendChild(statusText);

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '8px';

        const toggleBtn = document.createElement('button');
        toggleBtn.innerText = 'Start';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.padding = '6px 12px';
        toggleBtn.style.backgroundColor = '#00a8e1';
        toggleBtn.style.color = '#fff';
        toggleBtn.style.border = 'none';
        toggleBtn.style.borderRadius = '4px';

        const resetBtn = document.createElement('button');
        resetBtn.innerText = 'Reset Storage';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.padding = '6px 12px';
        resetBtn.style.backgroundColor = '#d9534f';
        resetBtn.style.color = '#fff';
        resetBtn.style.border = 'none';
        resetBtn.style.borderRadius = '4px';

        btnContainer.appendChild(toggleBtn);
        btnContainer.appendChild(resetBtn);
        container.appendChild(btnContainer);
        document.body.appendChild(container);

        toggleBtn.addEventListener('click', () => {
            isRunning = !isRunning;
            toggleBtn.innerText = isRunning ? 'Pause' : 'Start';
            toggleBtn.style.backgroundColor = isRunning ? '#f0ad4e' : '#00a8e1';

            if (isRunning) {
                processLibrary();
            }
        });

        resetBtn.addEventListener('click', () => {
            if (isRunning) {
                isRunning = false;
                toggleBtn.innerText = 'Start';
                toggleBtn.style.backgroundColor = '#00a8e1';
            }
            downloadedKeys.clear();
            skippedKeys.clear();
            localStorage.removeItem(STORAGE_KEY);
            updateStatusText();
        });
    }

    function updateStatusText(suffix = '') {
        const el = document.getElementById('amz-dl-status');
        if (el) {
            el.innerText = `Downloaded: ${downloadedKeys.size} | Skipped: ${skippedKeys.size} ${suffix}`;
        }
    }

    /*
     * Main execution loop. Amazon Music uses virtualized list rendering,
     * meaning DOM nodes are aggressively recycled as you scroll.
     * We continuously re-query the DOM to find the first un-processed node.
     */
    async function processLibrary() {
        while (isRunning) {
            const rows = Array.from(document.querySelectorAll('music-image-row'));

            if (rows.length === 0) {
                updateStatusText('(Waiting for rows...)');
                await sleep(2000);
                continue;
            }

            const nextRow = rows.find(row => {
                const key = row.getAttribute('data-key');
                return key && !downloadedKeys.has(key) && !skippedKeys.has(key);
            });

            if (nextRow) {
                const key = nextRow.getAttribute('data-key');

                nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(600);

                const contextBtn = nextRow.querySelector('music-button[slot="contextMenu"]');
                if (!contextBtn) {
                    skippedKeys.add(key);
                    updateStatusText();
                    continue;
                }

                contextBtn.click();
                await sleep(800);

                const downloadOption = document.querySelector('#contextMenuOverlay music-list-item[primary-text="Download"]');

                if (downloadOption) {
                    downloadOption.click();
                    downloadedKeys.add(key);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(downloadedKeys)));
                    updateStatusText();

                    await sleep(1000);
                } else {
                    document.body.click();
                    await sleep(400);
                    skippedKeys.add(key);
                    updateStatusText('(Skipped track - No DL option)');
                }
            } else {
                /*
                 * If we didn't find an unprocessed row, we've exhausted the current
                 * virtualized DOM chunk. Scroll the last visible element into view
                 * to trigger the next fetch.
                 */
                const lastRow = rows[rows.length - 1];
                lastRow.scrollIntoView({ behavior: 'smooth', block: 'start' });

                await sleep(1500);

                const loader = document.querySelector('music-shoveler music-icon[name="loader"]');
                if (!loader) {
                    const newRows = Array.from(document.querySelectorAll('music-image-row'));
                    const allProcessed = newRows.every(r => {
                        const k = r.getAttribute('data-key');
                        return downloadedKeys.has(k) || skippedKeys.has(k);
                    });

                    if (allProcessed && newRows.length === rows.length) {
                        isRunning = false;
                        updateStatusText('(Finished or Stalled)');
                        const toggleBtn = document.querySelector('button');
                        if (toggleBtn) {
                            toggleBtn.innerText = 'Start';
                            toggleBtn.style.backgroundColor = '#00a8e1';
                        }
                        break;
                    }
                } else {
                    updateStatusText('(Loading more...)');
                    await sleep(1500);
                }
            }
        }
    }

    window.addEventListener('load', () => {
        setTimeout(setupUI, 2000);
    });

})();
