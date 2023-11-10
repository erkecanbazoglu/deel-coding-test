const express = require("express");
const router = express.Router();

const { Op } = require("sequelize");

const { getProfile } = require("../middleware/getProfile");

router.get("/best-profession", getProfile, async (req, res) => {
  const profile = req.profile;

  // Getting the start and end dates
  const { start, end } = req.query;

  const { Contract } = req.app.get("models");
  // Getting the contracts of specific client
  const contracts = await Contract.findAll({
    where: {
      ClientId: profile.id,
    },
  });
  // Getting the ids of the contracts
  const contractIds = contracts.map((contract) => contract.id);
  // Getting the contractors ids

  const { Job } = req.app.get("models");
  // Getting the jobs where the contract is in the list of contracts and between selected dates
  const jobs = await Job.findAll({
    where: {
      [Op.and]: [
        {
          ContractId: {
            [Op.in]: contractIds,
          },
        },
        {
          paymentDate: {
            [Op.between]: [start, end],
          },
        },
      ],
    },
  });
  // Getting the jobContractIds
  const jobContractIds = jobs.map((job) => job.ContractId);
  // Getting the contractors ids that in which their jobs were paid in the given period
  const contractorsIds = contracts
    .filter((contract) => jobContractIds.includes(contract.id))
    .map((contract) => contract.ContractorId);

  const { Profile } = req.app.get("models");
  // Getting the contractors
  const contractors = await Profile.findAll({
    where: {
      id: {
        [Op.in]: contractorsIds,
      },
    },
  });
  // Creating an empty object to store the total price paid per profession
  const professionsToTotalPrice = {};

  // Iterating through the jobs
  jobs.forEach((job) => {
    // Getting the contract
    const contract = contracts.find(
      (contract) => contract.id === job.ContractId
    );

    // Getting the contractor
    const contractor = contractors.find(
      (contractor) => contractor.id === contract.ContractorId
    );

    // If the profession is not in the object
    if (!professionsToTotalPrice[contractor.profession]) {
      // Add the profession to the object
      professionsToTotalPrice[contractor.profession] = job.price;
    } else {
      // Otherwise, add the price to the profession
      professionsToTotalPrice[contractor.profession] += job.price;
    }
  });
  // Getting the profession with the highest total price
  const profession = Object.keys(professionsToTotalPrice).reduce(
    (a, b) => (professionsToTotalPrice[a] > professionsToTotalPrice[b] ? a : b),
    0
  );

  // Returning the contract
  return res.json(profession);
});

router.get("/best-clients", getProfile, async (req, res) => {
  // Getting the start and end dates
  const { start, end, limit: limitQueryParam } = req.query;
  const limit = limitQueryParam ? parseInt(limitQueryParam) : 2;

  const { Job } = req.app.get("models");
  // Getting the jobs between selected dates
  const jobs = await Job.findAll({
    where: {
      paymentDate: {
        [Op.between]: [start, end],
      },
    },
  });
  // Getting the unique contract ids
  const contractIds = [...new Set(jobs.map((job) => job.ContractId))];

  const { Contract } = req.app.get("models");
  // Getting the contracts where the status is "in_progress"
  const contracts = await Contract.findAll({
    where: {
      id: {
        [Op.in]: contractIds,
      },
    },
  });
  // Getting the unique client ids
  const clientIds = [
    ...new Set(contracts.map((contract) => contract.ClientId)),
  ];

  const { Profile } = req.app.get("models");
  // Getting the contractors
  const clients = await Profile.findAll({
    where: {
      id: {
        [Op.in]: clientIds,
      },
    },
  });

  // Creating clientId to totalPaid object
  const clientIdToTotalPaid = {};

  // Iterating through the jobs
  jobs.forEach((job) => {
    // Getting the contract
    const contract = contracts.find(
      (contract) => contract.id === job.ContractId
    );

    // Getting the client
    const client = clients.find((client) => client.id === contract.ClientId);

    // If the client is not in the object
    if (!clientIdToTotalPaid[client.id]) {
      // Add the client to the object
      clientIdToTotalPaid[client.id] = job.price;
    } else {
      // Otherwise, add the price to the client
      clientIdToTotalPaid[client.id] += job.price;
    }
  });

  // Getting the top clients ids
  const topClientsIdsSorted = Object.keys(clientIdToTotalPaid)
    .sort((a, b) => clientIdToTotalPaid[b] - clientIdToTotalPaid[a])
    .slice(0, limit);

  // Getting the top clients
  const topClients = clients
    .filter((client) => topClientsIdsSorted.includes(client.id.toString()))
    .sort(
      (a, b) =>
        topClientsIdsSorted.indexOf(a.id.toString()) -
        topClientsIdsSorted.indexOf(b.id.toString())
    );

  // Returning the top clients
  return res.json(topClients);
});

module.exports = router;
