const Joi = require('joi');
const log = require('loglevel');

const Session = require('../infra/database/Session');
const DeviceConfigurationRepository = require('../infra/database/DeviceConfigurationRepository');
const {
  getDeviceConfiguration,
  DeviceConfiguration,
} = require('../models/DeviceConfiguration');

const deviceConfigurationPostSchema = Joi.object({
  id: Joi.string().uuid().required(),
  device_identifier: Joi.string().required(),
  brand: Joi.string().required(),
  model: Joi.string().required(),
  device: Joi.string().required(),
  serial: Joi.string().allow('', null),
  hardware: Joi.string().required(),
  manufacturer: Joi.string().required(),
  app_build: Joi.string().required(),
  app_version: Joi.string().required(),
  os_version: Joi.string().required(),
  sdk_version: Joi.string().required(),
  logged_at: Joi.string().isoDate().required(),
}).unknown(false);

const deviceConfigurationIdParamSchema = Joi.object({
  device_configuration_id: Joi.string().uuid().required(),
}).unknown(false);

const deviceConfigurationPost = async function (req, res, next) {
  await deviceConfigurationPostSchema.validateAsync(req.body, {
    abortEarly: false,
  });

  const session = new Session();
  const deviceConfigurationRepo = new DeviceConfigurationRepository(session);

  try {
    const newDeviceConfiguration = {
      ...req.body,
      created_at: new Date().toISOString(),
    };
    const { id } = newDeviceConfiguration;
    const existingDeviceConfiguration = await deviceConfigurationRepo.getByFilter(
      { id },
    );

    const [deviceConfiguration] = existingDeviceConfiguration;

    if (!deviceConfiguration) {
      await session.beginTransaction();
      const createdDeviceConfiguration = await deviceConfigurationRepo.create(
        newDeviceConfiguration,
      );
      await session.commitTransaction();
      return res.status(201).json(createdDeviceConfiguration);
    }
    res.status(200).json(deviceConfiguration);
  } catch (e) {
    log.warn(e);
    if (session.isTransactionInProgress()) {
      await session.rollbackTransaction();
    }
    next(e);
  }
};

const deviceConfigurationGet = async function (req, res) {
  const session = new Session();
  const deviceConfigurationRepo = new DeviceConfigurationRepository(session);

  const executeGetDeviceConfigurations = getDeviceConfiguration(
    deviceConfigurationRepo,
  );
  const deviceConfigurations = await executeGetDeviceConfigurations();

  res.send(deviceConfigurations);
};

const deviceConfigurationSingleGet = async function (req, res) {
  await deviceConfigurationIdParamSchema.validateAsync(req.params, {
    abortEarly: false,
  });

  const session = new Session();
  const deviceConfigurationRepo = new DeviceConfigurationRepository(session);

  const deviceConfigurations = await deviceConfigurationRepo.getByFilter({
    id: req.params.device_configuration_id,
  });

  const [deviceConfiguration = {}] = deviceConfigurations;

  res.send(DeviceConfiguration(deviceConfiguration));
};

module.exports = {
  deviceConfigurationPost,
  deviceConfigurationGet,
  deviceConfigurationSingleGet,
};
