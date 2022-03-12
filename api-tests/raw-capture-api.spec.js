require('dotenv').config();
const request = require('supertest');
const server = require('../server/app');
const { expect } = require('chai');
const sinon = require('sinon');
const Broker = require('rascal').BrokerAsPromised;
const { knex, knexMainDB } = require('../server/infra/database/knex');
const { sessionObject } = require('./session-api.spec');
const { walletRegistrationObject } = require('./wallet-registration-api.spec');
const {
  deviceConfigurationObject,
} = require('./device-configuration-api.spec');
class RequestObject {
  constructor() {
    this.request_object = {
      id: '21ae129d-4233-4705-ac24-f4c96051e5ef',
      session_id: sessionObject.id,
      image_url: 'https://www.htpplkjl.com',
      lat: 37.421998333333335,
      lon: 122.08400000000002,
      gps_accuracy: 12,
      abs_step_count: 1,
      delta_step_count: 2,
      rotation_matrix: [1, 2, 3],
      note: '123',
      extra_attributes: [
        {
          key: 'extra',
          value: "extra's value",
        },
      ],
      captured_at: new Date().toISOString(),
    };

    this.delete_property = function (property) {
      delete this.request_object[property];
    };

    this.change_property = function (property, value) {
      this.request_object[property] = value;
    };
  }
}

const requestObject = new RequestObject();
const capture = {
  ...requestObject.request_object,
  id: 'f385f789-d08a-4c19-b8d8-c78370089bb3',
};

const domainEventObject = {
  id: 'e876107a-2a7c-442b-9e57-880d596e1025',
  payload: {
    id: capture.id,
  },
  status: 'raised',
  created_at: '2021-05-04 11:24:43',
  updated_at: '2021-05-04 11:24:43',
};

describe('Raw Captures', () => {
  let brokerStub;
  before(async () => {
    brokerStub = sinon.stub(Broker, 'create').resolves({
      publish: () => {
        return {
          on: (state, callback) => {
            if (state === 'success') callback();
          },
        };
      },
    });

    await knexMainDB('public.planter').insert({
      email: walletRegistrationObject.wallet,
      first_name: 'first_name',
      last_name: 'last_name',
    });
    await knex('device_configuration').insert({
      ...deviceConfigurationObject,
      created_at: new Date(),
    });
    await knex('wallet_registration').insert(walletRegistrationObject);
    await knex('session').insert({ ...sessionObject, created_at: new Date() });
    await knex('domain_event').insert(domainEventObject);
    await knex('raw_capture').insert({
      ...capture,
      extra_attributes: { entries: capture.extra_attributes },
      reference_id: 23,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  after(async () => {
    brokerStub.restore();

    await knexMainDB('tree_attributes').del();
    await knexMainDB('trees').del();
    await knexMainDB('planter').del();
    await knex('domain_event').del();
    await knex('raw_capture').del();
    await knex('session').del();
    await knex('device_configuration').del();
    await knex('wallet_registration').del();
  });

  const request_object = new RequestObject();
  it.only(`Raw capture should be successfully added`, function (done) {
    request(server)
      .post(`/raw-captures`)
      .send(request_object.request_object)
      .set('Accept', 'application/json')
      .expect(201)
      .end(function (err, res) {
        expect(res.body.id).to.eql(request_object.request_object.id);
        if (err) return done(err);
        return done();
      });
  });

  it(`Should handle duplicates`, function (done) {
    request(server)
      .post(`/raw-captures`)
      .send(request_object.request_object)
      .set('Accept', 'application/json')
      .expect(200)
      .end(function (err, res) {
        expect(res.body.id).to.eql(request_object.request_object.id);
        if (err) return done(err);
        return done();
      });
  });

  it('should resend capture created event if it wasnt successful last time and capture already exists', async () => {
    const res = await request(server)
      .post(`/raw-captures`)
      .send({ ...request_object.request_object, id: capture.id })
      .set('Accept', 'application/json')
      .expect(200);
    expect(res.body.id).to.eql(capture.id);
  });

  it('Added raw capture should be persisted', async function () {
    const res = await request(server).get(`/raw-captures`).expect(200);

    expect(
      res.body.some(
        (raw_capture) => raw_capture.id === request_object.request_object.id,
      ),
    ).to.equal(true);
  });

  it('should get a single raw capture', async function () {
    const res = await request(server)
      .get(`/raw-captures/${request_object.request_object.id}`)
      .expect(200);

    expect(res.body.id).to.eql(requestObject.request_object.id);
  });

  it('should confirm number of sent capture-created events', async () => {
    const numOfEmittedEvents = await knex('domain_event')
      .count()
      .where({ status: 'sent' });
    expect(+numOfEmittedEvents[0].count).to.eql(2);
  });
});
