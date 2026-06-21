import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Monadgotchi", function () {
  let Monadgotchi;
  let monadgotchi;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    Monadgotchi = await ethers.getContractFactory("Monadgotchi");
    monadgotchi = await Monadgotchi.deploy();
  });

  describe("Pet Creation", function () {
    it("should allow a user to hatch a new pet", async function () {
      await monadgotchi.createPet("Tama");
      const [name, age, fullness, happiness, cleanliness, isAlive, isSick, exists, level, xp] = 
        await monadgotchi.getPetState(owner.address);

      expect(name).to.equal("Tama");
      expect(fullness).to.equal(100);
      expect(happiness).to.equal(100);
      expect(cleanliness).to.equal(100);
      expect(isAlive).to.be.true;
      expect(isSick).to.be.false;
      expect(exists).to.be.true;
      expect(level).to.equal(1);
      expect(xp).to.equal(0);
    });

    it("should fail if name is empty", async function () {
      await expect(monadgotchi.createPet("")).to.be.revertedWith("Name cannot be empty");
    });

    it("should fail if name is longer than 32 characters", async function () {
      const longName = "a".repeat(33);
      await expect(monadgotchi.createPet(longName)).to.be.revertedWith("Name too long");
    });

    it("should fail to create a duplicate active pet", async function () {
      await monadgotchi.createPet("Tama");
      await expect(monadgotchi.createPet("Tama2")).to.be.revertedWith("You already have an active pet!");
    });
  });

  describe("Stat Decay", function () {
    beforeEach(async function () {
      await monadgotchi.createPet("Tama");
    });

    it("should decrease fullness, happiness, and cleanliness over time", async function () {
      // Fast forward 5 hours
      await time.increase(5 * 3600);

      const [name, age, fullness, happiness, cleanliness, isAlive, isSick, exists] = 
        await monadgotchi.getPetState(owner.address);

      // Decay rates:
      // hunger: 8% per hour -> 5 hours * 8 = 40% decay -> 60% remaining
      // happiness: 6% per hour -> 5 hours * 6 = 30% decay -> 70% remaining
      // cleanliness: 5% per hour -> 5 hours * 5 = 25% decay -> 75% remaining
      expect(fullness).to.equal(60);
      expect(happiness).to.equal(70);
      expect(cleanliness).to.equal(75);
    });

    it("should clamp values at 0", async function () {
      // Fast forward 24 hours (enough to decay all to 0)
      await time.increase(24 * 3600);

      const [name, age, fullness, happiness, cleanliness, isAlive, isSick, exists] = 
        await monadgotchi.getPetState(owner.address);

      expect(fullness).to.equal(0);
      expect(happiness).to.equal(0);
      expect(cleanliness).to.equal(0);
    });
  });

  describe("Pet Actions", function () {
    beforeEach(async function () {
      await monadgotchi.createPet("Tama");
    });

    it("should allow feeding to restore fullness", async function () {
      await time.increase(5 * 3600); // decays fullness to 60
      await monadgotchi.feed();

      const [name, age, fullness] = await monadgotchi.getPetState(owner.address);
      expect(fullness).to.equal(100);
    });

    it("should allow playing to restore happiness", async function () {
      await time.increase(5 * 3600); // decays happiness to 70
      await monadgotchi.play();

      const [,,, happiness] = await monadgotchi.getPetState(owner.address);
      expect(happiness).to.equal(100);
    });

    it("should allow cleaning to restore cleanliness", async function () {
      await time.increase(5 * 3600); // decays cleanliness to 75
      await monadgotchi.clean();

      const [,,,, cleanliness] = await monadgotchi.getPetState(owner.address);
      expect(cleanliness).to.equal(100);
    });

    it("should emit events for actions", async function () {
      await expect(monadgotchi.feed())
        .to.emit(monadgotchi, "PetFed")
        .withArgs(owner.address, 100);

      await expect(monadgotchi.play())
        .to.emit(monadgotchi, "PetPlayed")
        .withArgs(owner.address, 100);

      await expect(monadgotchi.clean())
        .to.emit(monadgotchi, "PetCleaned")
        .withArgs(owner.address, 100);
    });
  });

  describe("Sickness and Death", function () {
    beforeEach(async function () {
      await monadgotchi.createPet("Tama");
    });

    it("should mark pet as sick when a stat hits 0", async function () {
      // 13 hours * 8% = 104% -> fullness hits 0 first
      await time.increase(13 * 3600);

      const [,, fullness, happiness, cleanliness, isAlive, isSick] = 
        await monadgotchi.getPetState(owner.address);

      expect(fullness).to.equal(0);
      expect(isSick).to.be.true;
      expect(isAlive).to.be.true;
    });

    it("should die if sick for longer than the grace period (12 hours)", async function () {
      // 13 hours to hit 0 fullness + 12 hours grace period = 25 hours total
      await time.increase(25 * 3600);

      // Trigger status check/update
      await monadgotchi.checkAndKillPet(owner.address);

      const [,, fullness, happiness, cleanliness, isAlive, isSick] = 
        await monadgotchi.getPetState(owner.address);

      expect(isAlive).to.be.false;
      expect(isSick).to.be.false;
    });

    it("should prevent actions if pet is deceased", async function () {
      await time.increase(25 * 3600);
      await monadgotchi.checkAndKillPet(owner.address);

      await expect(monadgotchi.feed()).to.be.revertedWith("Your pet has passed away. You must revive it.");
      await expect(monadgotchi.play()).to.be.revertedWith("Your pet has passed away. You must revive it.");
      await expect(monadgotchi.clean()).to.be.revertedWith("Your pet has passed away. You must revive it.");
    });

    it("should reset sick status if cured before death", async function () {
      await time.increase(13 * 3600); // fullness is 0, pet is sick
      await monadgotchi.feed(); // cures hunger

      const [,, fullness,, cleanliness,, isSick] = 
        await monadgotchi.getPetState(owner.address);

      expect(fullness).to.equal(100);
      expect(isSick).to.be.false;
    });
  });

  describe("Revival", function () {
    beforeEach(async function () {
      await monadgotchi.createPet("Tama");
      await time.increase(25 * 3600);
      await monadgotchi.checkAndKillPet(owner.address);
    });

    it("should allow reviving a deceased pet with a new name", async function () {
      await monadgotchi.revive("Tama II");

      const [name, age, fullness, happiness, cleanliness, isAlive, isSick, exists, level, xp] = 
        await monadgotchi.getPetState(owner.address);

      expect(name).to.equal("Tama II");
      expect(isAlive).to.be.true;
      expect(fullness).to.equal(100);
      expect(happiness).to.equal(100);
      expect(cleanliness).to.equal(100);
      expect(level).to.equal(1);
      expect(xp).to.equal(0);
    });

    it("should fail to revive an already active/alive pet", async function () {
      await monadgotchi.revive("Tama II");
      await expect(monadgotchi.revive("Tama III")).to.be.revertedWith("Your pet is already alive!");
    });
  });

  describe("Leveling and Experience (XP)", function () {
    beforeEach(async function () {
      await monadgotchi.createPet("Tama");
    });

    it("should gain 15 XP upon taking care actions", async function () {
      await monadgotchi.feed();
      let [,,,,,,, , level, xp] = await monadgotchi.getPetState(owner.address);
      expect(xp).to.equal(15);
      expect(level).to.equal(1);

      await monadgotchi.play();
      [,,,,,,, , level, xp] = await monadgotchi.getPetState(owner.address);
      expect(xp).to.equal(30);
    });

    it("should level up when XP crosses 100", async function () {
      // 7 actions * 15 XP = 105 XP -> level 2, 5 XP remaining
      for (let i = 0; i < 7; i++) {
        await monadgotchi.feed();
      }

      const [,,,,,,, , level, xp] = await monadgotchi.getPetState(owner.address);
      expect(level).to.equal(2);
      expect(xp).to.equal(5);
    });

    it("should emit a LevelUp event when leveling up", async function () {
      // Perform 6 feeds to reach 90 XP
      for (let i = 0; i < 6; i++) {
        await monadgotchi.feed();
      }

      // 7th feed triggers LevelUp event
      await expect(monadgotchi.feed())
        .to.emit(monadgotchi, "LevelUp")
        .withArgs(owner.address, 2);
    });
  });
});
