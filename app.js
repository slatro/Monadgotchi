// Monadgotchi JS

// EIP-6963 Wallet Discovery
const announcedProviders = {};
window.addEventListener("eip6963:announceProvider", (event) => {
    const { info, provider: providerObj } = event.detail;
    announcedProviders[info.rdns] = providerObj;
    console.log("EIP-6963 Announce Provider:", info.name, info.rdns);
});
// Dispatch request event immediately
window.dispatchEvent(new Event("eip6963:requestProvider"));

// Ethers implementation setup
let provider;
let signer;
let contract;
let isWeb3Mode = false;
let isWeb3MockFallback = false;
let userAddress = null;

// Replace with your deployed contract address when ready
const CONTRACT_ADDRESS = "0x534C2b4054565861B2f6A31f3c3d9F273EF7b6e4"; 
const CONTRACT_ABI = [
    "function createPet(string memory _name) external",
    "function getPetState(address _owner) public view returns (string memory name, uint256 age, uint256 fullness, uint256 happiness, uint256 cleanliness, bool isAlive, bool isSick, bool exists, uint256 level, uint256 xp)",
    "function feed() external",
    "function play() external",
    "function clean() external",
    "function revive(string memory _name) external",
    "function checkAndKillPet(address _owner) external"
];

// Offline Local Database Simulation
const LOCAL_STORAGE_KEY = "monadgotchi_local_v1";

const DECAY_RATES = {
    hunger: 8,      // % per hour
    happiness: 6,   // % per hour
    cleanliness: 5  // % per hour
};
const SICK_GRACE_PERIOD = 12 * 60 * 60 * 1000; // 12 hours in ms

// DOM Elements
const connectWalletBtn = document.getElementById("connectWalletBtn");
const walletInfo = document.getElementById("walletInfo");
const walletAddressDisp = document.getElementById("walletAddress");
const modeTextDisp = document.getElementById("modeText");
const modeDotDisp = document.getElementById("modeDot");
const petSvg = document.getElementById("petSvg");
let isActionAnimating = false;
const petNameDisplay = document.getElementById("petNameDisplay");
const petAgeDisp = document.getElementById("petAge");
const petStatusText = document.getElementById("petStatusText");
const sickOverlay = document.getElementById("sickOverlay");
const ghostOverlay = document.getElementById("ghostOverlay");
const actionEffect = document.getElementById("actionEffect");

// Progress bars and values
const barHunger = document.getElementById("barHunger");
const barHappiness = document.getElementById("barHappiness");
const barCleanliness = document.getElementById("barCleanliness");
const barXp = document.getElementById("barXp");
const valHunger = document.getElementById("valHunger");
const valHappiness = document.getElementById("valHappiness");
const valCleanliness = document.getElementById("valCleanliness");
const valXp = document.getElementById("valXp");
const petLevelDisp = document.getElementById("petLevel");
const soundToggleBtn = document.getElementById("soundToggleBtn");

// Buttons
const feedBtn = document.getElementById("feedBtn");
const playBtn = document.getElementById("playBtn");
const cleanBtn = document.getElementById("cleanBtn");

// Modal
const createPetModal = document.getElementById("createPetModal");
const newPetNameInput = document.getElementById("newPetNameInput");
const startPetBtn = document.getElementById("startPetBtn");
const logBox = document.getElementById("logBox");
const walletSelectorModal = document.getElementById("walletSelectorModal");
const closeWalletModalBtn = document.getElementById("closeWalletModalBtn");

// Current Pet State Variable
let currentPet = null;

// Initialize App
window.addEventListener("DOMContentLoaded", () => {
    initLocalMode();
    setupEventListeners();
    
    // Set initial mute toggle symbol from stored preferences
    if (soundToggleBtn) {
        soundToggleBtn.textContent = audioManager.isMuted ? "🔇" : "🔊";
    }
    
    // Request EIP-6963 providers again to capture any that loaded slightly later
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    
    // Auto-check if MetaMask is already connected, but only if they didn't manually disconnect
    if (window.ethereum && localStorage.getItem("wallet_disconnected") !== "true") {
        window.ethereum.request({ method: 'eth_accounts' })
            .then(accounts => {
                if (accounts.length > 0) {
                    switchToWeb3();
                }
            })
            .catch(console.error);
    }
});

function setupEventListeners() {
    connectWalletBtn.addEventListener("click", openWalletModal);
    closeWalletModalBtn.addEventListener("click", closeWalletModal);
    walletAddressDisp.addEventListener("click", disconnectWallet); // Click to disconnect
    
    // Mute/Unmute toggle button
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener("click", () => {
            const isMuted = audioManager.toggleMute();
            soundToggleBtn.textContent = isMuted ? "🔇" : "🔊";
            audioManager.playClick();
        });
    }

    document.querySelectorAll(".wallet-opt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const walletType = btn.getAttribute("data-wallet");
            connectSpecificWallet(walletType);
        });
    });
    
    feedBtn.addEventListener("click", () => handleAction("feed"));
    playBtn.addEventListener("click", () => handleAction("play"));
    cleanBtn.addEventListener("click", () => handleAction("clean"));

    startPetBtn.addEventListener("click", handleCreatePetSubmit);
    
    const closeCreatePetModalBtn = document.getElementById("closeCreatePetModalBtn");
    if (closeCreatePetModalBtn) {
        closeCreatePetModalBtn.addEventListener("click", hideCreatePetModal);
    }

    // Attach click sound effect to all GameBoy console interactive layout components
    document.querySelectorAll(".arcade-btn, .pill-btn, .dpad > div, .close-modal-btn, .wallet-opt-btn, #connectWalletBtn, #walletAddress").forEach(el => {
        el.addEventListener("click", () => audioManager.playClick());
    });
}

// Write to Game Log Box
function addLog(text, type = "system") {
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    entry.textContent = `[${timeStr}] ${text}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
}

// -------------------------------------------------------------
// LOCAL SIMULATION LOGIC
// -------------------------------------------------------------

function initLocalMode() {
    isWeb3Mode = false;
    userAddress = "local_player";
    if (modeTextDisp) modeTextDisp.textContent = "OFFLINE";
    if (modeDotDisp) modeDotDisp.className = "mode-dot";
    
    if (walletInfo) walletInfo.classList.add("hidden");
    if (connectWalletBtn) connectWalletBtn.classList.remove("hidden");
    
    loadLocalPet();
    refreshUI();
    
    // Refresh stats every 5 seconds for simulation feel
    if (window.simInterval) clearInterval(window.simInterval);
    window.simInterval = setInterval(() => {
        if (!isWeb3Mode) {
            decayLocalPet();
            refreshUI();
        }
    }, 5000);
}

function getLocalKey() {
    return `${LOCAL_STORAGE_KEY}_${userAddress || 'local_player'}`;
}

function loadLocalPet() {
    const key = getLocalKey();
    let raw = localStorage.getItem(key);
    
    // Migration fallback for legacy non-partitioned local pet data
    if (!raw && (!userAddress || userAddress === "local_player")) {
        raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
            localStorage.setItem(key, raw);
        }
    }
    
    if (raw) {
        currentPet = JSON.parse(raw);
        addLog(`${currentPet.name} loaded!`, "system");
    } else {
        currentPet = null;
    }
}

function saveLocalPet() {
    if (currentPet) {
        const key = getLocalKey();
        localStorage.setItem(key, JSON.stringify(currentPet));
    }
}

function decayLocalPet() {
    if (!currentPet || !currentPet.isAlive) return;

    const now = Date.now();
    
    // Calculate decay since last action times
    const hoursSinceFed = (now - currentPet.lastFed) / (60 * 60 * 1000);
    const hoursSincePlayed = (now - currentPet.lastPlayed) / (60 * 60 * 1000);
    const hoursSinceCleaned = (now - currentPet.lastCleaned) / (60 * 60 * 1000);

    currentPet.fullness = Math.max(0, Math.floor(100 - (hoursSinceFed * DECAY_RATES.hunger)));
    currentPet.happiness = Math.max(0, Math.floor(100 - (hoursSincePlayed * DECAY_RATES.happiness)));
    currentPet.cleanliness = Math.max(0, Math.floor(100 - (hoursSinceCleaned * DECAY_RATES.cleanliness)));

    const isCurrentlySick = (currentPet.fullness === 0 || currentPet.happiness === 0 || currentPet.cleanliness === 0);

    if (isCurrentlySick) {
        if (!currentPet.lastSickTime) {
            currentPet.lastSickTime = now;
            addLog(`${currentPet.name} became sick! Needs immediate care!`, "critical");
        } else if (now - currentPet.lastSickTime >= SICK_GRACE_PERIOD) {
            currentPet.isAlive = false;
            addLog(`${currentPet.name} passed away due to neglect... 😢`, "critical");
        }
    } else {
        currentPet.lastSickTime = 0;
    }
    
    saveLocalPet();
}

// -------------------------------------------------------------
// WEB3 MONAD CONNECTIONS LOGIC
// -------------------------------------------------------------

function openWalletModal() {
    walletSelectorModal.classList.remove("hidden");
    document.body.classList.add("modal-open"); // Locks page scrolling
}

function closeWalletModal() {
    walletSelectorModal.classList.add("hidden");
    document.body.classList.remove("modal-open"); // Restores scrolling
}

function disconnectWallet() {
    isWeb3Mode = false;
    userAddress = "local_player";
    
    // Remember that the user manually disconnected
    localStorage.setItem("wallet_disconnected", "true");
    
    // Toggle UI display back to Connect Wallet button
    if (walletInfo) walletInfo.classList.add("hidden");
    if (connectWalletBtn) connectWalletBtn.classList.remove("hidden");
    
    addLog("Wallet disconnected. Returned to Offline Mode.", "system");
    initLocalMode();
}

async function connectSpecificWallet(walletType) {
    closeWalletModal();
    const walletName = walletType === "metamask" ? "MetaMask" : walletType === "rabby" ? "Rabby Wallet" : "Coinbase Wallet";
    addLog(`Connecting to ${walletName}...`, "system");
    
    let targetProvider = null;
    
    // 1. Try EIP-6963 announced providers first (most reliable in multi-wallet setups)
    if (walletType === "metamask") {
        targetProvider = announcedProviders["io.metamask"] || announcedProviders["io.metamask.mobile"];
    } else if (walletType === "rabby") {
        targetProvider = announcedProviders["io.rabby"];
    } else if (walletType === "coinbase") {
        targetProvider = announcedProviders["com.coinbase.wallet"];
    }
    
    // 2. Check if multiple providers exist under window.ethereum.providers (standard EIP-1193)
    if (!targetProvider && window.ethereum && window.ethereum.providers) {
        if (walletType === "metamask") {
            targetProvider = window.ethereum.providers.find(p => p.isMetaMask && !p.isRabby && !p.isCoinbaseWallet);
        } else if (walletType === "rabby") {
            targetProvider = window.ethereum.providers.find(p => p.isRabby);
        } else if (walletType === "coinbase") {
            targetProvider = window.ethereum.providers.find(p => p.isCoinbaseWallet || p.isCoinbase);
        }
    }
    
    // 3. Fallback to specific window injections or check window.ethereum properties directly
    if (!targetProvider) {
        if (walletType === "coinbase") {
            if (window.coinbaseWalletExtension) {
                targetProvider = window.coinbaseWalletExtension;
            } else if (window.ethereum && (window.ethereum.isCoinbaseWallet || window.ethereum.isCoinbase)) {
                targetProvider = window.ethereum;
            }
        } else if (walletType === "rabby") {
            if (window.rabby) {
                targetProvider = window.rabby;
            } else if (window.ethereum && window.ethereum.isRabby) {
                targetProvider = window.ethereum;
            }
        } else if (walletType === "metamask") {
            if (window.ethereum && window.ethereum.isMetaMask && !window.ethereum.isRabby && !window.ethereum.isCoinbaseWallet) {
                targetProvider = window.ethereum;
            }
        }
    }

    if (!targetProvider) {
        alert(`Please install or activate ${walletName}!`);
        addLog(`${walletName} not detected.`, "critical");
        return;
    }

    try {
        // Clear manual disconnect state on successful wallet connection request
        localStorage.removeItem("wallet_disconnected");
        await switchToWeb3(targetProvider);
    } catch (err) {
        console.error("Wallet connection error:", err);
        addLog("Wallet connection failed.", "critical");
    }
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        addLog("Wallet account switched. Reloading cyberpet...", "system");
        switchToWeb3(provider.provider);
    }
}

function handleChainChanged() {
    window.location.reload();
}

async function switchToWeb3(customProvider) {
    const activeProvider = customProvider || window.ethereum;
    provider = new ethers.BrowserProvider(activeProvider);
    
    // Request network switch to Monad Mainnet (Chain ID 143 / 0x8f)
    try {
        await activeProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x8f' }],
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await activeProvider.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: '0x8f',
                            chainName: 'Monad Mainnet',
                            nativeCurrency: {
                                name: 'MON',
                                symbol: 'MON',
                                decimals: 18,
                            },
                            rpcUrls: ['https://rpc.monad.xyz'],
                            blockExplorerUrls: ['https://monadscan.com'],
                        },
                    ],
                });
            } catch (addError) {
                console.error("Failed to add Monad Mainnet:", addError);
            }
        }
    }

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Fetch network chain ID
    const network = await provider.getNetwork();
    const chainId = network.chainId;
    
    // Set up account switching and chain changing listeners
    if (activeProvider && typeof activeProvider.on === 'function') {
        activeProvider.removeListener('accountsChanged', handleAccountsChanged);
        activeProvider.removeListener('chainChanged', handleChainChanged);
        
        activeProvider.on('accountsChanged', handleAccountsChanged);
        activeProvider.on('chainChanged', handleChainChanged);
    }
    
    // Show wallet Address
    const shortAddress = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
    walletAddressDisp.textContent = shortAddress;
    connectWalletBtn.classList.add("hidden");
    walletInfo.classList.remove("hidden");

    isWeb3Mode = true;
    isWeb3MockFallback = false;
    if (CONTRACT_ADDRESS === "0x5FbDB2315678afecb367f032d93F642f64180aa3" && chainId !== 31337n && chainId !== 31337) {
        addLog(`Network Mismatch: Expected Localhost (31337) but wallet is on Chain ${chainId}!`, "critical");
    }
    modeTextDisp.textContent = "Monad Network";
    modeDotDisp.className = "mode-dot live";
    addLog(`Wallet connected: ${shortAddress}`, "system");

    // Initialize Contract instance if setup
    if (CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        await fetchWeb3PetState();
        if (currentPet === null) {
            showCreatePetModal();
        }
    } else {
        addLog("No contract address specified. Using local simulation data.", "system");
        loadLocalPet();
        if (currentPet === null) {
            showCreatePetModal(); // Popup only after wallet connects!
        }
    }

    refreshUI();
}

async function fetchWeb3PetState() {
    if (!contract || !userAddress) return;
    
    try {
        const [name, age, fullness, happiness, cleanliness, isAlive, isSick, exists, level, xp] = 
            await contract.getPetState(userAddress);
            
        if (!exists) {
            currentPet = null;
            showCreatePetModal();
        } else {
            const oldLevel = currentPet ? currentPet.level : null;
            currentPet = {
                name: name,
                birthday: Date.now() - (Number(age) * 1000), // Approximate
                fullness: Number(fullness),
                happiness: Number(happiness),
                cleanliness: Number(cleanliness),
                isAlive: isAlive,
                isSick: isSick,
                exists: true,
                level: Number(level),
                xp: Number(xp)
            };
            
            // Web3 Level up check
            if (oldLevel !== null && currentPet.level > oldLevel) {
                addLog(`LEVEL UP! ${currentPet.name} reached Level ${currentPet.level}! 🎉`, "system");
                audioManager.playLevelUpFanfare();
            }
        }
    } catch (err) {
        console.warn("Web3 state read error, enabling Mock Fallback:", err);
        const reason = err.reason || err.message || "Unknown Error";
        addLog(`Web3 error: ${reason.substring(0, 50)}`, "critical");
        addLog("Contract not found on network. Enabled Web3 Mock Fallback!", "system");
        
        isWeb3MockFallback = true;
        isWeb3Mode = true;
        
        if (modeTextDisp) modeTextDisp.textContent = "Monad Network (Mock)";
        if (modeDotDisp) modeDotDisp.className = "mode-dot live";
        
        loadLocalPet();
        if (currentPet === null) {
            showCreatePetModal();
        }
        refreshUI();
    }
}

// -------------------------------------------------------------
// GAME INTERACTIONS
// -------------------------------------------------------------

function showCreatePetModal() {
    createPetModal.classList.remove("hidden");
    document.body.classList.add("modal-open"); // Locks page scrolling
}

function hideCreatePetModal() {
    createPetModal.classList.add("hidden");
    document.body.classList.remove("modal-open"); // Restores scrolling
}

function handleCreatePetSubmit() {
    const name = newPetNameInput.value.trim();
    if (!name) {
        alert("Please give your pet a name!");
        return;
    }
    if (isWeb3Mode && contract && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && !isWeb3MockFallback) {
        // Blockchain call
        addLog(`Hatching pet on blockchain: ${name}...`, "system");
        contract.createPet(name)
            .then(tx => {
                addLog("Confirming transaction...", "system");
                return tx.wait();
            })
            .then(() => {
                addLog(`Pet created successfully!`, "system");
                hideCreatePetModal();
                fetchWeb3PetState().then(refreshUI);
            })
            .catch(err => {
                console.error(err);
                addLog("Pet creation failed.", "critical");
            });
    } else if (isWeb3Mode && isWeb3MockFallback) {
        addLog(`Hatching pet (Web3 Mock): ${name}...`, "system");
        addLog("Please sign the message in your wallet...", "system");
        signer.signMessage(`Hatch my Monadgotchi named ${name}!`)
        .then(() => {
            addLog(`Pet created successfully! (Mock confirmation)`, "system");
            currentPet = {
                name: name,
                birthday: Date.now(),
                lastFed: Date.now(),
                lastPlayed: Date.now(),
                lastCleaned: Date.now(),
                lastSickTime: 0,
                fullness: 100,
                happiness: 100,
                cleanliness: 100,
                level: 1,
                xp: 0,
                isAlive: true,
                exists: true
            };
            saveLocalPet();
            hideCreatePetModal();
            refreshUI();
        })
        .catch(err => {
            console.error(err);
            addLog("Transaction rejected or failed.", "critical");
        });
    } else {
        // Local simulation creation
        currentPet = {
            name: name,
            birthday: Date.now(),
            lastFed: Date.now(),
            lastPlayed: Date.now(),
            lastCleaned: Date.now(),
            lastSickTime: 0,
            fullness: 100,
            happiness: 100,
            cleanliness: 100,
            level: 1,
            xp: 0,
            isAlive: true,
            exists: true
        };
        saveLocalPet();
        addLog(`Your new pet ${name} has hatched! 🐣`, "action");
        hideCreatePetModal();
        refreshUI();
    }
}

async function handleAction(actionType) {
    if (!currentPet) return;
    if (!currentPet.isAlive) {
        // If dead, clicking acts as trigger to revive
        showCreatePetModal();
        return;
    }

    triggerActionEffect(actionType);

    if (isWeb3Mode && contract && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && !isWeb3MockFallback) {
        addLog(`Sending on-chain ${actionType} action...`, "system");
        try {
            let tx;
            if (actionType === "feed") tx = await contract.feed();
            if (actionType === "play") tx = await contract.play();
            if (actionType === "clean") tx = await contract.clean();
            
            addLog("Waiting for block confirmation...", "system");
            await tx.wait();
            addLog(`Blockchain action successful! Pet state updated.`, "action");
            await fetchWeb3PetState();
            refreshUI();
        } catch (err) {
            console.error(err);
            addLog(`Transaction failed or cancelled.`, "critical");
        }    } else if (isWeb3Mode && isWeb3MockFallback) {
        addLog(`Sending on-chain ${actionType} action (Web3 Mock)...`, "system");
        try {
            addLog("Please sign the action in your wallet...", "system");
            await signer.signMessage(`Perform action: ${actionType} for my Monadgotchi!`);
            addLog(`Blockchain action successful! (Mock confirmation)`, "action");
            const now = Date.now();
            if (actionType === "feed") {
                currentPet.lastFed = now;
                currentPet.fullness = 100;
                addLog(`${currentPet.name} ate a delicious pizza! 🍕`, "action");
            } else if (actionType === "play") {
                currentPet.lastPlayed = now;
                currentPet.happiness = 100;
                addLog(`${currentPet.name} played a game! 🎮`, "action");
            } else if (actionType === "clean") {
                currentPet.lastCleaned = now;
                currentPet.cleanliness = 100;
                addLog(`${currentPet.name} took a bath and is squeaky clean! 🧼`, "action");
            }
            
            if (!currentPet.level) currentPet.level = 1;
            if (currentPet.xp === undefined) currentPet.xp = 0;
            currentPet.xp += 15;
            if (currentPet.xp >= 100) {
                currentPet.level += Math.floor(currentPet.xp / 100);
                currentPet.xp = currentPet.xp % 100;
                addLog(`LEVEL UP! ${currentPet.name} reached Level ${currentPet.level}! 🎉`, "system");
                audioManager.playLevelUpFanfare();
            }
            
            if (currentPet.fullness > 0 && currentPet.happiness > 0 && currentPet.cleanliness > 0) {
                currentPet.lastSickTime = 0;
            }
            saveLocalPet();
            refreshUI();
        } catch (err) {
            console.error(err);
            addLog(`Transaction failed or cancelled.`, "critical");
        }
    } else {
        // Local Simulation Action
        const now = Date.now();
        if (actionType === "feed") {
            currentPet.lastFed = now;
            currentPet.fullness = 100;
            addLog(`${currentPet.name} ate a delicious pizza! 🍕`, "action");
        } else if (actionType === "play") {
            currentPet.lastPlayed = now;
            currentPet.happiness = 100;
            addLog(`${currentPet.name} played a game! 🎮`, "action");
        } else if (actionType === "clean") {
            currentPet.lastCleaned = now;
            currentPet.cleanliness = 100;
            addLog(`${currentPet.name} took a bath and is squeaky clean! 🧼`, "action");
        }
        
        // Gain XP on care actions
        if (!currentPet.level) currentPet.level = 1;
        if (currentPet.xp === undefined) currentPet.xp = 0;
        
        currentPet.xp += 15;
        if (currentPet.xp >= 100) {
            currentPet.level += Math.floor(currentPet.xp / 100);
            currentPet.xp = currentPet.xp % 100;
            addLog(`LEVEL UP! ${currentPet.name} reached Level ${currentPet.level}! 🎉`, "system");
            audioManager.playLevelUpFanfare();
        }
        
        // Check if cured
        if (currentPet.fullness > 0 && currentPet.happiness > 0 && currentPet.cleanliness > 0) {
            currentPet.lastSickTime = 0;
        }

        saveLocalPet();
        refreshUI();
    }
}

// On-screen floating reaction bubble animation
function triggerActionEffect(type) {
    let emoji = "";
    let actionClass = "";
    if (type === "feed") {
        emoji = "🍕";
        actionClass = "eating";
        audioManager.playFeedChime();
    }
    if (type === "play") {
        emoji = "💖";
        actionClass = "playing";
        audioManager.playPlayChime();
    }
    if (type === "clean") {
        emoji = "✨";
        actionClass = "cleaning";
        audioManager.playCleanChime();
    }

    actionEffect.textContent = emoji;
    actionEffect.className = "action-effect animate";
    
    // Apply animation class to the SVG face
    isActionAnimating = true;
    const lvl = currentPet ? (currentPet.level || 1) : 1;
    const stageClass = lvl >= 6 ? "stage-adult" : (lvl >= 3 ? "stage-teen" : "stage-baby");
    petSvg.setAttribute("class", `pet-face-svg ${actionClass} ${stageClass}`);
    
    setTimeout(() => {
        actionEffect.className = "action-effect";
        isActionAnimating = false;
        refreshUI();
    }, 2000); // 2 seconds of animation
}

// -------------------------------------------------------------
// UI RENDERING / REFRESH
// -------------------------------------------------------------

function refreshUI() {
    if (!currentPet) {
        if (isWeb3Mode) {
            showCreatePetModal();
        } else {
            hideCreatePetModal();
            petNameDisplay.textContent = "NO PET";
            petAgeDisp.textContent = "0s";
            petStatusText.textContent = "DISCONNECTED";
            petStatusText.style.color = "#777799";
            petStatusText.style.textShadow = "none";
            petSvg.setAttribute("class", "pet-face-svg idle stage-baby");
            
            petLevelDisp.textContent = "1";
            updateProgressBar(barHunger, valHunger, 0);
            updateProgressBar(barHappiness, valHappiness, 0);
            updateProgressBar(barCleanliness, valCleanliness, 0);
            updateProgressBar(barXp, valXp, 0);
        }
        return;
    }

    petNameDisplay.textContent = currentPet.name.toUpperCase();
    
    // Calculate Age
    const ageMs = Date.now() - currentPet.birthday;
    const ageSeconds = Math.floor(ageMs / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    
    if (ageMinutes > 0) {
        petAgeDisp.textContent = `${ageMinutes}m`;
    } else {
        petAgeDisp.textContent = `${ageSeconds}s`;
    }

    // Refresh Progress Bars
    updateProgressBar(barHunger, valHunger, currentPet.fullness);
    updateProgressBar(barHappiness, valHappiness, currentPet.happiness);
    updateProgressBar(barCleanliness, valCleanliness, currentPet.cleanliness);

    // Update level and XP
    const lvl = currentPet.level || 1;
    const xpVal = currentPet.xp || 0;
    petLevelDisp.textContent = lvl;
    updateProgressBar(barXp, valXp, xpVal);
    
    const stageClass = lvl >= 6 ? "stage-adult" : (lvl >= 3 ? "stage-teen" : "stage-baby");

    // If an action animation is running, do not overwrite face graphics yet
    if (isActionAnimating) return;

    // Apply Animations & Status labels
    const isSick = (currentPet.fullness === 0 || currentPet.happiness === 0 || currentPet.cleanliness === 0);
    
    // Audio transition chimes tracking state
    if (window.lastAliveState === undefined) window.lastAliveState = true;
    if (window.lastSickState === undefined) window.lastSickState = false;

    if (!currentPet.isAlive) {
        petStatusText.textContent = "DECEASED";
        petStatusText.style.color = "var(--red-critical)";
        petStatusText.style.textShadow = "0 0 5px var(--red-critical)";
        petSvg.setAttribute("class", `pet-face-svg dead ${stageClass}`);
        ghostOverlay.classList.remove("hidden");
        sickOverlay.classList.add("hidden");
        
        feedBtn.querySelector(".arcade-btn-label").textContent = "REVIVE";
        playBtn.querySelector(".arcade-btn-label").textContent = "REVIVE";
        cleanBtn.querySelector(".arcade-btn-label").textContent = "REVIVE";
        
        if (window.lastAliveState) {
            audioManager.playDeathMelody();
            window.lastAliveState = false;
        }
    } else if (isSick) {
        petStatusText.textContent = "SICK";
        petStatusText.style.color = "var(--red-critical)";
        petStatusText.style.textShadow = "0 0 5px var(--red-critical)";
        petSvg.setAttribute("class", `pet-face-svg sick ${stageClass}`);
        sickOverlay.classList.remove("hidden");
        ghostOverlay.classList.add("hidden");
        
        feedBtn.querySelector(".arcade-btn-label").textContent = "FEED";
        playBtn.querySelector(".arcade-btn-label").textContent = "PLAY";
        cleanBtn.querySelector(".arcade-btn-label").textContent = "CLEAN";
        
        if (!window.lastSickState) {
            audioManager.playWarningTone();
            window.lastSickState = true;
        }
        window.lastAliveState = true;
    } else {
        petStatusText.textContent = "HEALTHY";
        petStatusText.style.color = "var(--green-healthy)";
        petStatusText.style.textShadow = "0 0 5px var(--green-healthy)";
        petSvg.setAttribute("class", `pet-face-svg idle ${stageClass}`);
        sickOverlay.classList.add("hidden");
        ghostOverlay.classList.add("hidden");
        
        feedBtn.querySelector(".arcade-btn-label").textContent = "FEED";
        playBtn.querySelector(".arcade-btn-label").textContent = "PLAY";
        cleanBtn.querySelector(".arcade-btn-label").textContent = "CLEAN";
        
        window.lastSickState = false;
        window.lastAliveState = true;
    }
}

function updateProgressBar(barElement, labelElement, value) {
    barElement.style.width = `${value}%`;
    labelElement.textContent = `${value}%`;

    // Dynamic coloring based on health levels
    barElement.className = "progress-bar";
    if (value > 50) {
        barElement.classList.add("healthy");
    } else if (value > 20) {
        barElement.classList.add("warning");
    } else {
        barElement.classList.add("danger");
    }
}
