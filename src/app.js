const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const { Op } = require("sequelize");
const app = express();
const cors = require("cors");

app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);
app.use(cors());

/**
 * FIX ME!
 * @returns contract by id
 */
app.get("/contracts/:id", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const { id } = req.params;
  const contract = await Contract.findOne({ where: { id } });
  const profile = req.profile;
  // Returning 404 if contract not found
  if (!contract) return res.status(404).end();
  // Returning 401 if profile is not authorized to view the contract
  if (
    (profile.type === "client" && contract.ClientId !== profile.id) ||
    (profile.type === "contractor" && contract.ContractorId !== profile.id)
  ) {
    return res.status(401).end();
  }
  // Returning the contract
  return res.json(contract);
});

app.get("/contracts", getProfile, async (req, res) => {
  const profile = req.profile;

  // Getting the non-terminated contracts for the profile
  // Below tested the feature of the raw queries of sequelize*
  const result = await sequelize.query(
    `SELECT * from contracts WHERE ${
      profile.type === "client" ? "ClientId" : "ContractorId"
    } = ${profile.id} AND status != 'terminated'`
  );
  const contracts = result[0];
  // Returning the contracts
  return res.json(contracts);
});

app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const profile = req.profile;

  const { Contract } = req.app.get("models");
  // Getting the contracts where the status is "in_progress"
  const contracts = await Contract.findAll({
    where: {
      [Op.and]: [
        {
          [profile.type === "client" ? "ClientId" : "ContractorId"]: profile.id,
        },
        { status: "in_progress" },
      ],
    },
  });
  // Getting the ids of the contracts
  const contractIds = contracts.map((contract) => contract.id);

  const { Job } = req.app.get("models");
  // Getting the jobs where the contract is in the list of contracts and the job is not paid
  const jobs = await Job.findAll({
    where: {
      [Op.and]: [
        {
          ContractId: {
            [Op.in]: contractIds,
          },
        },
        {
          paid: {
            [Op.not]: true,
          },
        },
      ],
    },
  });
  // Returning the jobs
  return res.json(jobs);
});

app.get("/jobs/:job_id/pay", getProfile, async (req, res) => {
  const profile = req.profile;

  // Returning 401 if profile is not authorized to pay (contractor)
  if (profile.type === "contractor") {
    return res.status(401).end();
  }

  // Getting the client balance
  const balance = profile.balance;

  // Getting the job_id
  const { job_id } = req.params;

  const { Job } = req.app.get("models");
  // Getting the job by id
  const job = await Job.findOne({
    where: {
      id: job_id,
    },
  });

  // Returning 404 if job not found
  if (!job) return res.status(404).end();

  // Checking if the balance is enough to pay the job
  if (balance < job.price) {
    return res.status(402).end();
  }

  // Getting the contract id
  const contractId = job.ContractId;

  const { Contract } = req.app.get("models");
  // Getting the contract
  const contract = await Contract.findOne({
    where: {
      id: contractId,
    },
  });

  // Returning 404 if contract not found
  if (!contract) return res.status(404).end();

  // Returning 401 if contract client id does not match the client profile id
  if (contract.ClientId !== profile.id) {
    return res.status(401).end();
  }

  const { Profile } = req.app.get("models");

  // Getting the contractor profile
  const contractor = await Profile.findOne({
    where: { id: contract.ContractorId },
  });

  // Returning 404 if contractor not found
  if (!contractor) return res.status(404).end();

  try {
    // Transaction to update sensitive data (balance) at once
    const result = await sequelize.transaction(async (t) => {
      // Updating the balance of the client
      await Profile.update(
        { balance: balance - job.price },
        {
          where: {
            id: profile.id,
          },
        },
        { transaction: t }
      );

      // Updating the balance of the contractor
      await Profile.update(
        { balance: contractor.balance + job.price },
        {
          where: {
            id: contract.ContractorId,
          },
        },
        { transaction: t }
      );

      return "ok";
    });
  } catch (error) {
    // Handling the transaction error
    console.log(error);
    return res.status(500).end();
  }

  return res.status(200).json("ok");
});

// Where does the deposit amount come from?
// Isn't the userId in query params same as the profile id provided in the headers?
// I assume someone else should not be able to deposit, so I will use it to double check that users are the same
app.get("/balances/deposit/:userId", getProfile, async (req, res) => {
  const profile = req.profile;

  // Getting the user id
  const { userId } = req.params;

  // Returning 401 if profile is not authorized to deposit (contractor)
  // Or if client profile id does not match the userId in query params
  if (profile.type === "contractor" || userId != profile.id) {
    return res.status(401).end();
  }

  const { Contract } = req.app.get("models");
  // Getting the contracts where the status is not "terminated"
  const contracts = await Contract.findAll({
    where: {
      [Op.and]: [
        {
          ClientId: profile.id,
        },
        {
          status: {
            [Op.not]: "terminated",
          },
        },
      ],
    },
  });
  // Getting the ids of the contracts
  const contractIds = contracts.map((contract) => contract.id);

  const { Job } = req.app.get("models");
  // Getting the jobs where the contract is in the list of contracts and the job is not paid
  const jobs = await Job.findAll({
    where: {
      [Op.and]: [
        {
          ContractId: {
            [Op.in]: contractIds,
          },
        },
        {
          paid: {
            [Op.not]: true,
          },
        },
      ],
    },
  });

  // Getting the total amount of the jobs
  const totalAmount = jobs.reduce((acc, job) => acc + job.price, 0);

  // Since the deposit amount is not clear , I will assume it is 20% of the current balance
  const depositAmount = profile.balance * 0.2;

  // Returning 402 if the deposit amount is 25% greater than the total amount
  if (depositAmount > totalAmount * 1.25) {
    return res.status(402).end();
  }

  const { Profile } = req.app.get("models");

  // Updating the balance of the client
  await Profile.update(
    { balance: profile.balance + depositAmount },
    {
      where: {
        id: profile.id,
      },
    }
  );

  return res.status(200).json("ok");
});

// Admin Routes imported from routes/admin.js
const adminRouter = require("./routes/admin");

// 'admin/best-profession'
// '/admin/best-clients'
app.use("/admin", adminRouter);

module.exports = app;
