import {isEmptyObject} from "./utils";

export class TransactionalRepository {
  constructor(mapper, modelName, readRepository, transaction, changeProxyFactory, logger) {
    this._mapper = mapper;
    this._modelName = modelName;
    this._changeProxyFactory = changeProxyFactory;
    this._logger = logger;
    this._transaction = transaction;
    this._readRepository = readRepository;
  }

  /**
   * Create an entity using payload
   * @param {object} payload
   */
  create(payload) {
    this._transaction.add(() => this._mapper.insert(this._modelName, payload));
  }

  /**
   * Update one entity matching constraints with changes
   * @param {object} where
   * @param {object} changes
   */
  updateOne(where, changes) {
    if (typeof changes === 'object') {
      return this._updateStatic(where, changes);
    }
    if (typeof changes === 'function') {
      // ND - deprecating this for multiple reasons:
      // - there's a possible unhandled promise rejection here because result is only resolved in transaction action
      // - this method has two signatures
      // - the callback version is not explicit that it reads data from committed
      // - should be replaced by findOne({query}) then updateOne({id})
      this._logger.warn("DEPRECATED: TransactionalRepository.updateOne({query}, callback) is deprecated. Instead use findOne({query}) then updateOne({id}, {calculatedChanges}).");
      const result = this._readRepository.findOne(this._modelName, where, true);
      this._transaction.add(async() => {
        const actualChanges = this._processRow(await result, changes);
        if (isEmptyObject(actualChanges)) return;
        await this._mapper.update(this._modelName, actualChanges, where);
      });
      return;
    }
    throw new Error('Invalid parameter for change, must be an object or a function.');
  }

  /**
   * Update multiple entities matching constraints with the same changes
   * @param {object} where
   * @param {object} changes
   */
  updateWhere(where, changes) {
    return this._updateStatic(where, changes);
  }

  /**
   * @param {object} where
   */
  remove(where) {
    this._transaction.add(() => this._mapper.remove(this._modelName, where));
  }

  /**
   * @param {object} where
   * @param {boolean} [noThrowOnNotFound]
   */
  findOne(where, noThrowOnNotFound) {
    return this._readRepository.findOne(this._modelName, where, noThrowOnNotFound);
  }

  /**
   * @param {object} where
   */
  findWhere(where) {
    return this._readRepository.findWhere(this._modelName, where);
  }

  findAll() {
    return this._readRepository.findAll(this._modelName);
  }

  /**
   * @param {object} where
   * @return {Promise<boolean>}
   */
  exists(where) {
    return this._readRepository.exists(this._modelName, where);
  }

  _updateStatic(where, data) {
    this._transaction.add(() => this._mapper.update(this._modelName, data, where));
  }

  _processRow(row, change) {
    if (!row) return {};
    const {handler, proxy} = this._changeProxyFactory(row);
    change(proxy);
    return handler.getChanges();
  }
}
export default TransactionalRepository;

/**
 * @callback updateOneCallback
 * @param {object} data
 * @returns {object} modified data
 */
