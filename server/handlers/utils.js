/*
 * Global error handlers
 */
const log = require("loglevel");
const HttpError = require("./HttpError");
const {ValidationError} = require("joi");

/*
 * This is from the library https://github.com/Abazhenov/express-async-handler
 * Made some customization for our project. With this, we can throw Error from
 * the handler function or internal function call stack, and parse the error, 
 * send to the client with appropriate response (http error code & json body)
 *
 * USAGE: wrap the express handler with this function:
 *
 *  router.get("/xxx", handlerWrap(async (res, rep, next) => {
 *    ...
 *  }));
 *
 *  Then, add the errorHandler below to the express global error handler.
 *
 */
exports.handlerWrapper = fn =>
  function wrap(...args) {
    const fnReturn = fn(...args)
    const next = args[args.length-1]
    return Promise.resolve(fnReturn).catch(e => {
      next(e);
    })
  }

exports.errorHandler = (err, req, res, next) => {
  log.debug("catch error:", err);
  if(err instanceof HttpError){
    res.status(err.code).send({
      code: err.code,
      message: err.message,
    });
  }else if(err instanceof ValidationError){
    res.status(422).send({
      code: 422,
      message: err.details.map(m => m.message).join(";"),
    });
  }else{
    res.status(500).send({
      code: 500,
      message: `Unknown error (${err.message})`,
    });
  }
};