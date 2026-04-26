import * as assert from 'assert';

import { findMethodIdInXml } from '../extension';

suite('Mapper XML lookup', () => {
	test('finds mapper method id location in XML', () => {
		const xmlText = [
			'<?xml version="1.0" encoding="UTF-8" ?>',
			'<mapper namespace="com.example.UserMapper">',
			'    <select id="findUserById" resultType="User">',
			'        select * from users where id = #{id}',
			'    </select>',
			'</mapper>',
		].join('\n');

		const location = findMethodIdInXml(xmlText, 'findUserById');

		assert.deepStrictEqual(location, {
			targetLine: 2,
			startChar: 16,
		});
	});
});
