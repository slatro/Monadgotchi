// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Monadgotchi {
    struct Pet {
        string name;
        uint256 birthday;
        uint256 lastFed;
        uint256 lastPlayed;
        uint256 lastCleaned;
        uint256 lastSickTime; // Time when any stat first hit 0
        uint256 level;
        uint256 xp;
        bool isAlive;
        bool exists;
    }

    mapping(address => Pet) public pets;

    // Decay rates per hour (values out of 100)
    uint256 public constant DECAY_RATE_HUNGER = 8;      // Loses 8 points of fullness per hour
    uint256 public constant DECAY_RATE_HAPPINESS = 6;   // Loses 6 points of happiness per hour
    uint256 public constant DECAY_RATE_CLEANLINESS = 5;  // Loses 5 points of cleanliness per hour

    uint256 public constant SICK_GRACE_PERIOD = 12 hours;

    event PetCreated(address indexed owner, string name, uint256 birthday);
    event PetFed(address indexed owner, uint256 newFullness);
    event PetPlayed(address indexed owner, uint256 newHappiness);
    event PetCleaned(address indexed owner, uint256 newCleanliness);
    event PetRevived(address indexed owner, string name);
    event PetDied(address indexed owner);
    event LevelUp(address indexed owner, uint256 newLevel);

    modifier petExists() {
        require(pets[msg.sender].exists, "You do not have a pet yet! Create one.");
        _;
    }

    modifier petAlive() {
        require(pets[msg.sender].isAlive, "Your pet has passed away. You must revive it.");
        _;
    }

    function createPet(string memory _name) external {
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(bytes(_name).length <= 32, "Name too long");
        
        Pet storage pet = pets[msg.sender];
        if (pet.exists) {
            require(!pet.isAlive, "You already have an active pet!");
        }

        pets[msg.sender] = Pet({
            name: _name,
            birthday: block.timestamp,
            lastFed: block.timestamp,
            lastPlayed: block.timestamp,
            lastCleaned: block.timestamp,
            lastSickTime: 0,
            level: 1,
            xp: 0,
            isAlive: true,
            exists: true
        });

        emit PetCreated(msg.sender, _name, block.timestamp);
    }

    function getPetState(address _owner) public view returns (
        string memory name,
        uint256 age,
        uint256 fullness,
        uint256 happiness,
        uint256 cleanliness,
        bool isAlive,
        bool isSick,
        bool exists,
        uint256 level,
        uint256 xp
    ) {
        Pet memory pet = pets[_owner];
        if (!pet.exists) {
            return ("", 0, 0, 0, 0, false, false, false, 0, 0);
        }

        if (!pet.isAlive) {
            return (pet.name, block.timestamp - pet.birthday, 0, 0, 0, false, false, true, pet.level, pet.xp);
        }

        // Calculate hours elapsed since last action
        uint256 hoursSinceFed = (block.timestamp - pet.lastFed) / 1 hours;
        uint256 hoursSincePlayed = (block.timestamp - pet.lastPlayed) / 1 hours;
        uint256 hoursSinceCleaned = (block.timestamp - pet.lastCleaned) / 1 hours;

        // Apply decay
        uint256 currentFullness = 100 > (hoursSinceFed * DECAY_RATE_HUNGER) ? 100 - (hoursSinceFed * DECAY_RATE_HUNGER) : 0;
        uint256 currentHappiness = 100 > (hoursSincePlayed * DECAY_RATE_HAPPINESS) ? 100 - (hoursSincePlayed * DECAY_RATE_HAPPINESS) : 0;
        uint256 currentCleanliness = 100 > (hoursSinceCleaned * DECAY_RATE_CLEANLINESS) ? 100 - (hoursSinceCleaned * DECAY_RATE_CLEANLINESS) : 0;

        bool currentlySick = (currentFullness == 0 || currentHappiness == 0 || currentCleanliness == 0);
        bool petStillAlive = true;

        // Check if pet died due to sickness length
        if (currentlySick) {
            uint256 sickTime = pet.lastSickTime;
            if (sickTime == 0) {
                // Calculate dynamically when it first hit 0
                uint256 zeroHunger = pet.lastFed + (100 * 1 hours) / DECAY_RATE_HUNGER;
                uint256 zeroHappiness = pet.lastPlayed + (100 * 1 hours) / DECAY_RATE_HAPPINESS;
                uint256 zeroCleanliness = pet.lastCleaned + (100 * 1 hours) / DECAY_RATE_CLEANLINESS;

                if (currentFullness == 0) {
                    sickTime = zeroHunger;
                }
                if (currentHappiness == 0) {
                    if (sickTime == 0 || zeroHappiness < sickTime) {
                        sickTime = zeroHappiness;
                    }
                }
                if (currentCleanliness == 0) {
                    if (sickTime == 0 || zeroCleanliness < sickTime) {
                        sickTime = zeroCleanliness;
                    }
                }
            }

            if (sickTime > 0 && block.timestamp - sickTime >= SICK_GRACE_PERIOD) {
                petStillAlive = false;
                currentFullness = 0;
                currentHappiness = 0;
                currentCleanliness = 0;
            }
        }

        return (
            pet.name,
            block.timestamp - pet.birthday,
            currentFullness,
            currentHappiness,
            currentCleanliness,
            petStillAlive,
            currentlySick && petStillAlive,
            true,
            pet.level,
            pet.xp
        );
    }

    function feed() external petExists petAlive {
        // Update state logic
        Pet storage pet = pets[msg.sender];
        
        // Check if pet was sick and we are curing it
        bool wasSick = (getPetFullness(msg.sender) == 0);
        
        // Increase fullness to 100
        pet.lastFed = block.timestamp;
        
        // If we are curing it, reset sick time if no other stats are 0
        if (wasSick) {
            resetSickStatus(pet);
        }

        gainXP(pet, 15);
        emit PetFed(msg.sender, 100);
    }

    function play() external petExists petAlive {
        Pet storage pet = pets[msg.sender];
        bool wasSick = (getPetHappiness(msg.sender) == 0);

        pet.lastPlayed = block.timestamp;

        if (wasSick) {
            resetSickStatus(pet);
        }

        gainXP(pet, 15);
        emit PetPlayed(msg.sender, 100);
    }

    function clean() external petExists petAlive {
        Pet storage pet = pets[msg.sender];
        bool wasSick = (getPetCleanliness(msg.sender) == 0);

        pet.lastCleaned = block.timestamp;

        if (wasSick) {
            resetSickStatus(pet);
        }

        gainXP(pet, 15);
        emit PetCleaned(msg.sender, 100);
    }

    function gainXP(Pet storage pet, uint256 amount) internal {
        pet.xp += amount;
        if (pet.xp >= 100) {
            pet.level += pet.xp / 100;
            pet.xp = pet.xp % 100;
            emit LevelUp(msg.sender, pet.level);
        }
    }

    // Helper functions for easy internal status fetching
    function getPetFullness(address _owner) internal view returns (uint256) {
        Pet memory pet = pets[_owner];
        uint256 hoursSinceFed = (block.timestamp - pet.lastFed) / 1 hours;
        return 100 > (hoursSinceFed * DECAY_RATE_HUNGER) ? 100 - (hoursSinceFed * DECAY_RATE_HUNGER) : 0;
    }

    function getPetHappiness(address _owner) internal view returns (uint256) {
        Pet memory pet = pets[_owner];
        uint256 hoursSincePlayed = (block.timestamp - pet.lastPlayed) / 1 hours;
        return 100 > (hoursSincePlayed * DECAY_RATE_HAPPINESS) ? 100 - (hoursSincePlayed * DECAY_RATE_HAPPINESS) : 0;
    }

    function getPetCleanliness(address _owner) internal view returns (uint256) {
        Pet memory pet = pets[_owner];
        uint256 hoursSinceCleaned = (block.timestamp - pet.lastCleaned) / 1 hours;
        return 100 > (hoursSinceCleaned * DECAY_RATE_CLEANLINESS) ? 100 - (hoursSinceCleaned * DECAY_RATE_CLEANLINESS) : 0;
    }

    function resetSickStatus(Pet storage pet) internal {
        // Recalculate stats based on updated timestamps to check if still sick
        uint256 currentFullness = getPetFullness(msg.sender);
        uint256 currentHappiness = getPetHappiness(msg.sender);
        uint256 currentCleanliness = getPetCleanliness(msg.sender);

        if (currentFullness > 0 && currentHappiness > 0 && currentCleanliness > 0) {
            pet.lastSickTime = 0;
        } else {
            pet.lastSickTime = block.timestamp;
        }
    }

    function checkAndKillPet(address _owner) external {
        (,,,,, bool alive,,,,) = getPetState(_owner);
        if (!alive && pets[_owner].isAlive) {
            pets[_owner].isAlive = false;
            emit PetDied(_owner);
        }
    }

    function revive(string memory _name) external petExists {
        Pet storage pet = pets[msg.sender];
        require(!pet.isAlive, "Your pet is already alive!");
        
        pet.name = _name;
        pet.birthday = block.timestamp;
        pet.lastFed = block.timestamp;
        pet.lastPlayed = block.timestamp;
        pet.lastCleaned = block.timestamp;
        pet.lastSickTime = 0;
        pet.level = 1;
        pet.xp = 0;
        pet.isAlive = true;

        emit PetRevived(msg.sender, _name);
    }
}
