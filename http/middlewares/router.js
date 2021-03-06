const express = require('express');
const healthCheck = require('../routes/health-check');

const authorization = require('./authorization');

const isRoute = (object) => {
  const keys = Object.keys(object);
  return keys.includes('path') && keys.includes('handler');
};

const createPermissionsHandler = (permissions, publicRoute, profiles) => async (req, res, next) => {
  try {
    req.permissions = permissions || [];
    req.publicRoute = publicRoute;
    req.profiles = profiles || [];
    next();
  } catch (err) {
    next(err);
  }
};

const createAuthorizationMiddleware = (config) => async (req, res, next) => {
  try {
    await authorization(config)(req, res, next);
  } catch (err) {
    next(err);
  }
};

const getAuthorizationMiddlewares = (config, permissions, profiles, publicRoute) => [
  createPermissionsHandler(permissions, publicRoute, profiles),
  createAuthorizationMiddleware(config),
];

const getRouteMiddleware = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

const includeRouteToRouter = (route, router, config) => {
  const {
    method, path, handler, permissions, profiles, publicRoute,
  } = route;
  const middlewares = route.middlewares || [];
  let handlers = []

  if (config.withoutAuth) {
    handlers = [
      ...middlewares,
      getRouteMiddleware(handler),
    ];
  } else {
    handlers = [
      ...getAuthorizationMiddlewares(config, permissions, profiles, publicRoute),
      ...middlewares,
      getRouteMiddleware(handler),
    ];
  }
  

  if (!method || method === 'GET') {
    router.get(path, ...handlers);
  } else if (method === 'POST') {
    router.post(path, ...handlers);
  } else if (method === 'PUT') {
    router.put(path, ...handlers);
  } else if (method === 'DELETE') {
    router.delete(path, ...handlers);
  }
};

const findRoutes = (object, router, config) => {
  let routesObject = {};

  if (object instanceof Function) {
    routesObject = object({
      services: config.services,
    });
  } else if (object instanceof Object) {
    routesObject = object;
  }

  Object.values(routesObject).forEach((item) => {
    if (isRoute(item)) {
      includeRouteToRouter(item, router, config);
    } else {
      findRoutes(item, router, config);
    }
  });
};

module.exports = (config) => {
  const { routes } = config;

  const router = express.Router();
  router.get('/health-check', healthCheck);

  if (!routes) {
    return router;
  }

  findRoutes(routes, router, config);
  return router;
};
