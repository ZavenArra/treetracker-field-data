const log = require('loglevel');

const { createTreesInMainDB, LegacyTree } = require('../models/LegacyTree');
const {
  createRawCapture,
  rawCaptureFromRequest,
  getRawCaptures,
} = require('../models/RawCapture');
const { dispatch } = require('../models/domain-event');
const Joi = require('joi');

const Session = require('../infra/database/Session');
const { publishMessage } = require('../infra/messaging/RabbitMQMessaging');

const RawCaptureRepository = require('../infra/database/RawCaptureRepository');
const EventRepository = require('../infra/database/EventRepository');
const SessionRepository = require('../infra/database/SessionRepository');
const LegacyTreeRepository = require('../infra/database/LegacyTreeRepository');
const LegacyTreeAttributeRepository = require('../infra/database/LegacyTreeAttributeRepository');

const rawCaptureSchema = Joi.object({
  id: Joi.string().required().guid().required(),
  session_id: Joi.string().guid().required(),
  lat: Joi.number().required().min(-90).max(90),
  lon: Joi.number().required().min(-180).max(180),
  image_url: Joi.string().uri().required(),
  gps_accuracy: Joi.number().integer().required(),
  abs_step_count: Joi.number().integer().required(),
  delta_step_count: Joi.number().integer().required(),
  rotation_matrix: Joi.array().items(Joi.number().integer()).required(),
  note: Joi.string().allow(null, ''),
  extra_attributes: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().required(),
        value: Joi.string().required().allow(''),
      }),
    )
    .allow(null),
  capture_taken_at: Joi.date().iso().required(),
}).unknown(false);

const rawCaptureGet = async (req, res, next) => {
  const session = new Session(false);
  const captureRepo = new RawCaptureRepository(session);
  const executeGetRawCaptures = getRawCaptures(captureRepo);
  const result = await executeGetRawCaptures(req.query);
  res.send(result);
  res.end();
};

const rawCapturePost = async (req, res, next) => {
  log.warn('raw capture post...');
  // console.log(req.body);
  await rawCaptureSchema.validateAsync(req.body, { abortEarly: false });
  const session = new Session(false);
  const migrationSession = new Session(true);
  const captureRepo = new RawCaptureRepository(session);
  const eventRepository = new EventRepository(session);
  const sessionRepo = new SessionRepository(session);
  const legacyTreeRepository = new LegacyTreeRepository(migrationSession);
  const legacyTreeAttributeRepository = new LegacyTreeAttributeRepository(
    migrationSession,
  );

  const executeCreateRawCapture = createRawCapture(
    captureRepo,
    eventRepository,
  );
  const eventDispatch = dispatch(eventRepository, publishMessage);
  const legacyDataMigration = createTreesInMainDB(
    legacyTreeRepository,
    legacyTreeAttributeRepository,
  );

  try {
    const existingCapture = await captureRepo.getByFilter({
      'raw_capture.id': req.body.id,
    });
    const [rawCapture] = existingCapture;
    if (rawCapture) {
      const domainEvent = await eventRepository.getDomainEventByPayloadId(
        rawCapture.id,
      );
      if (domainEvent.status !== 'sent') {
        eventDispatch(domainEvent);
      }
      res.status(200).json(rawCapture);
    } else {
      let sessionObject = {};
      if (req.body.session_id) {
        const sessionArray = await sessionRepo.getSession({
          'session.id': req.body.session_id,
        });
        [sessionObject] = sessionArray;
      }
      console.log('sessionObject', sessionObject);
      await migrationSession.beginTransaction();
      const legacyTreeObject = await LegacyTree({
        ...req.body,
        ...sessionObject,
        session: migrationSession,
      });
      console.log('legacytreeobject', legacyTreeObject);
      const { entity: tree } = await legacyDataMigration(
        { ...legacyTreeObject },
        req.body.attributes || [],
      );
      const rawCapture = rawCaptureFromRequest({
        reference_id: tree.id,
        ...req.body,
      });
      await session.beginTransaction();

      const { entity, raisedEvents } = await executeCreateRawCapture(
        rawCapture,
      );
      await session.commitTransaction();
      await migrationSession.commitTransaction();
      raisedEvents.forEach((domainEvent) => eventDispatch(domainEvent));
      log.warn('succeeded.');
      return res.status(201).json(entity);
    }
  } catch (e) {
    log.warn('catch error in transaction');
    console.log(e);
    if (session.isTransactionInProgress()) {
      await session.rollbackTransaction();
    }
    if (migrationSession.isTransactionInProgress()) {
      await migrationSession.rollbackTransaction();
    }
    next(e);
  }
};

module.exports = {
  rawCaptureGet,
  rawCapturePost,
};
